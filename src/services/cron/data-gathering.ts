import DrizzleClient from 'services/database/drizzle/drizzle-client';
import { ErrorResponse } from 'services/database/drizzle/models/response';
import { Artist } from 'services/database/drizzle/schema/artists';
import { sendDiscordMessage } from 'services/discord-webhook';
import { ParsedProfile } from 'services/twitter/models/parsed-profile';
import { ProfileSource } from 'services/twitter/models/fetch-profile-result';
import ProfileFetcher from 'services/twitter/profile-fetcher';
import { logger } from 'utils/logger';

type FetchSummary = {
  fetched: Map<string, ParsedProfile>;
  sources: Record<ProfileSource, number>;
  suspended: Artist[];
  notFound: Artist[];
  failed: Artist[];
};

const MAX_LISTED_USERS = 10;

export class DataGathering {
  private drizzleClient = new DrizzleClient();
  private profileFetcher = new ProfileFetcher();

  private readonly MAX_RETRIES = 10;
  private readonly BASE_DELAY = 15000;
  private readonly MAX_DELAY = 300000;
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
        const rankingChange = artist.ranking ? artist.ranking - newRank : 0;
        return {
          ...artist,
          previousRanking: artist.ranking,
          ranking: newRank,
          rankingChange,
        };
      });
  }

  private listUsers(artists: Artist[]) {
    const names = artists.slice(0, MAX_LISTED_USERS).map(a => a.username);
    return `${names.join(', ')}${artists.length > MAX_LISTED_USERS ? `... (+${artists.length - MAX_LISTED_USERS})` : ''}`;
  }

  private async fetchWithRetry(artist: Artist) {
    for (let attempt = 1; ; attempt++) {
      const result = await this.profileFetcher.fetch(artist);
      if (result.status !== 'error') return result;

      logger.warn(`Fetch failed for ${artist.username} (attempt ${attempt}/${this.MAX_RETRIES}): ${result.message}`);
      if (attempt >= this.MAX_RETRIES) return result;

      const backoff = Math.min(this.BASE_DELAY * Math.pow(1.5, attempt - 1), this.MAX_DELAY);
      logger.info(`Retrying after ${Math.round(backoff / 1000)}s...`);
      await this.sleep(backoff);
    }
  }

  private async fetchAllArtists(artists: Artist[]): Promise<FetchSummary> {
    const summary: FetchSummary = {
      fetched: new Map(),
      sources: { id: 0, username: 0, fxtwitter: 0 },
      suspended: [],
      notFound: [],
      failed: [],
    };
    const total = artists.length;

    this.profileFetcher.resetIdLookup();

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i];
      const current = i + 1;

      logger.info(`[${current}/${total}] Fetching ${artist.username}`);

      if (i > 0) {
        await this.sleep(this.REQUEST_INTERVAL);
      }

      const result = await this.fetchWithRetry(artist);

      if (result.status === 'ok') {
        summary.fetched.set(artist.twitterUserId, result.profile);
        summary.sources[result.source]++;
        if (result.profile.username !== artist.username) {
          logger.info(`${artist.username} was renamed to ${result.profile.username}`);
        }
      } else if (result.status === 'suspended') {
        summary.suspended.push(artist);
        logger.warn(`${artist.username} is suspended`);
      } else if (result.status === 'not_found') {
        summary.notFound.push(artist);
        logger.warn(`${artist.username} was not found`);
      } else {
        summary.failed.push(artist);
        logger.error(`Failed to fetch ${artist.username}: ${result.message}`);
      }

      if (current % 50 === 0) {
        const successRate = Math.round((summary.fetched.size / current) * 100);
        sendDiscordMessage(
          'Progress update',
          `Processed ${current}/${total} artists\nSuccess rate: ${successRate}% (${summary.fetched.size} successful, ${current - summary.fetched.size} failed)`,
          'info'
        );
      }
    }

    const unavailable = summary.suspended.length + summary.notFound.length + summary.failed.length;
    const successRate = Math.round((summary.fetched.size / total) * 100);
    logger.info(`Fetch completed: ${summary.fetched.size}/${total} successful (${successRate}%)`);

    if (unavailable > 0) {
      const lines = [
        `**Final results:**`,
        `Successful: ${summary.fetched.size} (by id: ${summary.sources.id}, by username: ${summary.sources.username}, via FxTwitter: ${summary.sources.fxtwitter})`,
        `Success rate: ${successRate}%`,
      ];
      if (this.profileFetcher.isIdLookupDisabled) lines.push('Lookup by id is unavailable, fell back to usernames');
      if (summary.suspended.length)
        lines.push(`\nSuspended (${summary.suspended.length}): ${this.listUsers(summary.suspended)}`);
      if (summary.notFound.length) {
        lines.push(`\nNot found, deleted or renamed (${summary.notFound.length}): ${this.listUsers(summary.notFound)}`);
      }
      if (summary.failed.length)
        lines.push(`\nFailed after retries (${summary.failed.length}): ${this.listUsers(summary.failed)}`);

      sendDiscordMessage('Fetch summary', lines.join('\n'), summary.failed.length > total * 0.1 ? 'error' : 'warning');
    }

    return summary;
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

      const { fetched, suspended, notFound } = await this.fetchAllArtists(artists);
      logger.info(`Fetched ${fetched.size} profiles`);

      if (!fetched.size) {
        logger.error('No artists were successfully fetched!');
        sendDiscordMessage('Critical error', 'Failed to fetch ANY artist profiles!', 'error');
        return;
      }

      const suspendedIds = new Set(suspended.map(a => a.twitterUserId));
      const notFoundIds = new Set(notFound.map(a => a.twitterUserId));

      const updated = artists.map(artist => {
        const parsed = fetched.get(artist.twitterUserId);
        if (!parsed) {
          if (suspendedIds.has(artist.twitterUserId)) return { ...artist, trackingStatus: 'suspended' };
          if (notFoundIds.has(artist.twitterUserId)) return { ...artist, trackingStatus: 'not_found' };
          return artist;
        }

        return {
          ...artist,
          trackingStatus: 'active',
          name: parsed.displayName || artist.name,
          username: parsed.username || artist.username,
          url: parsed.url || artist.url,
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
          ranked
            .filter(a => fetched.has(a.twitterUserId))
            .map(a => ({
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
        `**Successfully updated:**\nProfiles: \`${profileRes.items.length}\`\nTrends: \`${trendsRes.items.length}\`\nFetch rate: \`${Math.round((fetched.size / artists.length) * 100)}%\``,
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
