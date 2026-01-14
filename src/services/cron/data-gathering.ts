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

export class DataGathering {
  private drizzleClient = new DrizzleClient();
  private twitterClient = new TwitterClient();

  private readonly MAX_RETRIES = 10;
  private readonly BASE_DELAY = 15000;
  private readonly REQUEST_INTERVAL = 3000;

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
      const usernameResult = await this.twitterClient.getTwitterUserByUsername(artist.username);
      if ('error' in usernameResult) {
        throw new Error(typeof usernameResult.error === 'string' ? usernameResult.error : 'Unknown error from API');
      }
      const data = usernameResult;

      if (data.userId !== artist.twitterUserId) {
        logger.warn(
          `UserId mismatch for ${artist.username}: expected ${artist.twitterUserId}, got ${data.userId}. User might have been suspended/deleted and username taken by someone else.`
        );
        sendDiscordMessage(
          'UserId mismatch detected!',
          `Username **${artist.username}** now belongs to different user.\nExpected: \`${artist.twitterUserId}\`\nGot: \`${data.userId}\` (${data.displayName})`,
          'warning'
        );
      }

      logger.debug(`Fetched profile for ${artist.username}`);
      return { success: true, data };
    } catch (err: any) {
      const message = err.message || String(err);
      logger.warn(`Fetch failed for ${artist.username} (attempt ${attempt}/${this.MAX_RETRIES}): ${message}`);

      if (attempt < this.MAX_RETRIES) {
        const backoff = this.BASE_DELAY * Math.pow(1.5, attempt - 1);
        const maxBackoff = 300000;
        const finalBackoff = Math.min(backoff, maxBackoff);

        logger.info(`Retrying after ${Math.round(finalBackoff / 1000)}s...`);
        await this.sleep(finalBackoff);
        return this.fetchWithRetry(artist, attempt + 1);
      }

      logger.error(`All ${this.MAX_RETRIES} attempts failed for ${artist.username}: ${message}`);

      sendDiscordMessage(
        'Failed to fetch artist after all retries',
        `**${artist.username}** (${artist.name})\nError: \`${message}\`\nAttempts: ${this.MAX_RETRIES}`,
        'error'
      );

      return { success: false, artist, error: message, attempt };
    }
  }

  private async fetchAllArtists(artists: Artist[]): Promise<ParsedProfile[]> {
    const parsed: ParsedProfile[] = [];
    const failed: Artist[] = [];
    const total = artists.length;

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i];
      const current = i + 1;

      logger.info(`[${current}/${total}] Fetching ${artist.username}`);

      if (i > 0) {
        await this.sleep(this.REQUEST_INTERVAL);
      }

      const result = await this.fetchWithRetry(artist);

      if (result.success) {
        parsed.push(result.data);
        logger.info(`Successfully fetched ${artist.username} (${parsed.length}/${total})`);
      } else {
        failed.push(result.artist);
        logger.error(`Failed to fetch ${artist.username} after all attempts`);
      }

      if (current % 50 === 0) {
        const successRate = Math.round((parsed.length / current) * 100);
        sendDiscordMessage(
          'Progress update',
          `Processed ${current}/${total} artists\nSuccess rate: ${successRate}% (${parsed.length} successful, ${failed.length} failed)`,
          'info'
        );
      }
    }

    const successRate = Math.round((parsed.length / total) * 100);
    logger.info(`Fetch completed: ${parsed.length}/${total} successful (${successRate}%)`);

    if (failed.length > 0) {
      logger.warn(`Failed to fetch ${failed.length} artists: ${failed.map(a => a.username).join(', ')}`);
      sendDiscordMessage(
        'Fetch summary',
        `**Final results:**\nSuccessful: ${parsed.length}\nFailed: ${failed.length}\nSuccess rate: ${successRate}%\n\nFailed users: ${failed
          .slice(0, 10)
          .map(a => a.username)
          .join(', ')}${failed.length > 10 ? '...' : ''}`,
        failed.length > total * 0.1 ? 'error' : 'warning'
      );
    }

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
      sendDiscordMessage('Updating artists data', `Starting to fetch \`${artists.length}\` artists`, 'warning');

      const parsedArtists = await this.fetchAllArtists(artists);
      logger.info(`Fetched ${parsedArtists.length} profiles`);

      if (!parsedArtists.length) {
        logger.error('No artists were successfully fetched!');
        sendDiscordMessage('Critical error', 'Failed to fetch ANY artist profiles!', 'error');
        return;
      }

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

      const [profileRes, trendsRes] = await Promise.all([
        this.drizzleClient.updateArtistInformationBulk(ranked),
        this.drizzleClient.updateTrendsInformationBulk(
          ranked.map(a => ({
            twitterUserId: a.twitterUserId,
            followersCount: a.followersCount,
            tweetsCount: a.tweetsCount,
          }))
        ),
      ]);

      logger.info(`Updated profiles: ${profileRes.items.length}, trends: ${trendsRes.items.length}`);

      const percentRes = await this.drizzleClient.updateArtistsFollowersTweetsPercent();

      sendDiscordMessage(
        'Updating artists data completed',
        `**Successfully updated:**\nProfiles: \`${profileRes.items.length}\`\nTrends: \`${trendsRes.items.length}\`\nFetch rate: \`${Math.round((parsedArtists.length / artists.length) * 100)}%\``,
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
