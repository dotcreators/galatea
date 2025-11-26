import DrizzleClient from 'services/database/drizzle/drizzle-client';
import { ErrorResponse } from 'services/database/drizzle/models/response';
import { Artist } from 'services/database/drizzle/schema/artists';
import { sendDiscordMessage } from 'services/discord-webhook';
import { ParsedProfile } from 'services/twitter/models/parsed-profile';
import TwitterClient from 'services/twitter/open-api/twitter-client';
import { logger } from 'utils/logger';

type FetchResult =
  | { success: true; data: ParsedProfile }
  | { success: false; artist: Artist; error: string; attempt: number };

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private limit: number,
    private intervalMs: number
  ) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.intervalMs);

    if (this.timestamps.length >= this.limit) {
      const waitTime = this.timestamps[0] + this.intervalMs - now + 100;
      logger.warn(`Rate limit reached (${this.limit} requests/${this.intervalMs / 1000}s). Waiting ${waitTime}ms...`);
      await new Promise(res => setTimeout(res, waitTime));

      return this.schedule(fn);
    }

    this.timestamps.push(now);
    return fn();
  }
}

export class DataGathering {
  private drizzleClient = new DrizzleClient();
  private twitterClient = new TwitterClient();

  private readonly FETCH_CONCURRENCY = 5;
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY = 10000;
  private readonly RATE_LIMITER = new RateLimiter(30, 60_000);

  private async sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms));
  }

  private handleErrors(errors: ErrorResponse[], operation: string) {
    if (!errors?.length) return;
    logger.warn(`${errors.length} errors during ${operation}`);
    errors.forEach(error => {
      const msg = `${error.reason}: ${error.description}`;
      logger.error(msg, operation);
      sendDiscordMessage(`Error while updating \`${operation}\``, `\`\`\`${msg}\`\`\``, 'error');
    });
  }

  private calculateArtistsRanking(artists: Artist[]): Artist[] {
    return artists
      .sort((a, b) => b.followersCount - a.followersCount)
      .map((artist, i) => {
        const newRank = i + 1;
        const rankingChange = artist.previousRanking && artist.ranking ? artist.ranking - newRank : 0;
        return {
          ...artist,
          previousRanking: artist.ranking,
          ranking: newRank,
          rankingChange,
        };
      });
  }

  private async fetchWithRetry(artist: Artist, attempt = 1): Promise<FetchResult> {
    try {
      const data = await this.RATE_LIMITER.schedule(() =>
        this.twitterClient.getTwitterUserByUserId(artist.twitterUserId)
      );

      if ('error' in data) throw new Error(data.error);
      logger.debug(`Fetched profile for ${artist.username}`);
      return { success: true, data };
    } catch (err: any) {
      const message = err.message || String(err);
      logger.warn(`Fetch failed for ${artist.username} (attempt ${attempt}): ${message}`);

      if (attempt < this.MAX_RETRIES) {
        const backoff = this.BASE_DELAY * Math.pow(2, attempt - 1);
        logger.info(`Retrying after ${backoff}ms...`);
        await this.sleep(backoff);
        return this.fetchWithRetry(artist, attempt + 1);
      }

      logger.error(`All attempts failed for ${artist.username}: ${message}`);
      return { success: false, artist, error: message, attempt };
    }
  }

  private async fetchAllArtists(artists: Artist[]): Promise<ParsedProfile[]> {
    const parsed: ParsedProfile[] = [];
    const total = artists.length;
    const q = [...artists];
    let processed = 0;

    const workers = Array.from({ length: this.FETCH_CONCURRENCY }, async (_, i) => {
      const worker = `W${i + 1}`;
      while (q.length > 0) {
        const artist = q.shift()!;
        const current = ++processed;
        logger.info(`[${worker}] [${current}/${total}] Fetching ${artist.username}`);
        const res = await this.fetchWithRetry(artist);
        if (res.success) parsed.push(res.data);
      }
    });

    await Promise.all(workers);
    return parsed;
  }

  async updateArtistsData() {
    try {
      const artists = await this.drizzleClient.getArtistsProfiles();
      if (!artists.length) {
        logger.warn('No artists found');
        sendDiscordMessage('Updating artists data', 'Received `0` artist profiles', 'error');
        return;
      }

      logger.info(`Received ${artists.length} artist profiles`);
      sendDiscordMessage('Updating artists data', `Fetching \`${artists.length}\` artists`, 'warning');

      const parsedArtists = await this.fetchAllArtists(artists);
      logger.info(`Fetched ${parsedArtists.length} profiles`);

      if (!parsedArtists.length) return;

      const updated = artists.map(artist => {
        const parsed = parsedArtists.find(p => p.userId === artist.twitterUserId);
        if (!parsed) return artist;

        return {
          ...artist,
          name: parsed.displayName || artist.name,
          username: parsed.username || artist.username,
          tweetsCount: parsed.tweetsCount ?? artist.tweetsCount,
          followersCount: parsed.followersCount ?? artist.followersCount,
          images: {
            avatar: parsed.avatarUrl || artist.images.avatar,
            banner: parsed.bannerUrl || artist.images.banner,
          },
          bio: parsed.biography || artist.bio,
          website: parsed.website || artist.website,
          updatedAt: new Date(),
        };
      });

      const ranked = this.calculateArtistsRanking(updated);

      const [profileRes, trendsRes, percentRes] = await Promise.all([
        this.drizzleClient.updateArtistInformationBulk(ranked),
        this.drizzleClient.updateTrendsInformationBulk(
          ranked.map(a => ({
            twitterUserId: a.twitterUserId,
            followersCount: a.followersCount,
            tweetsCount: a.tweetsCount,
          }))
        ),
        this.drizzleClient.updateArtistsFollowersTweetsPercent(),
      ]);

      logger.info(`Updated profiles: ${profileRes.items.length}, trends: ${trendsRes.items.length}`);

      sendDiscordMessage(
        'Updating artists data',
        `Updated \`${profileRes.items.length}\` artists + \`${trendsRes.items.length}\` trends`,
        'info'
      );

      this.handleErrors(profileRes.errors ?? [], 'update artists profiles');
      this.handleErrors(trendsRes.errors ?? [], 'update artists trends');
      this.handleErrors(percentRes.errors ?? [], 'update follower/tweet percent');
    } catch (err: any) {
      logger.error(`Fatal error in updateArtistsData: ${err.message}`);
      sendDiscordMessage('Fatal error in updating artists data', `\`\`\`${err.message}\`\`\``, 'error');
    }
  }
}
