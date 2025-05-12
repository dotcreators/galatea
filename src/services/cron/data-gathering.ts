import DrizzleClient from 'services/database/drizzle/drizzle-client';
import { ErrorResponse } from 'services/database/drizzle/models/response';
import { Artist } from 'services/database/drizzle/schema/artists';
import { sendDiscordMessage } from 'services/discord-webhook';
import { ParsedProfile } from 'services/twitter/models/parsed-profile';
import TwitterClient from 'services/twitter/open-api/twitter-client';
import { logger } from 'utils';

class DataGathering {
  private drizzleClient = new DrizzleClient();
  private twitterClient = new TwitterClient();
  private readonly FETCH_TIMEOUT = 3000;

  private calculateArtistsRanking(artists: Artist[]): Artist[] {
    artists.sort((a, b) => b.followersCount - a.followersCount);

    artists.forEach((artist, index) => {
      const newRanking = index + 1;
      const rankingChange = artist.previousRanking - newRanking;

      artist.previousRanking = artist.ranking;
      artist.ranking = newRanking;
      artist.rankingChange = rankingChange;
    });

    return artists;
  }

  private handleErrors(errors: ErrorResponse[], operation: string) {
    if (errors && errors.length > 0) {
      logger(`Errors in ${operation} (${errors.length}):`);
      logger(errors.map(error => error.description).join(', '));

      errors.forEach(element => {
        sendDiscordMessage(
          `Error while updating ${'```'}${operation}${'```'}`,
          `${'```'}${element.reason}:\n${element.description}${'```'}`,
          'error'
        );
      });
    }
  }

  async updateArtistsInformation() {
    try {
      const artists = await this.drizzleClient.getArtistsProfiles();

      if (artists.length === 0) {
        logger('Recieved 0 artists profiles dotcreators-sun');
        return;
      }

      logger(`Recieved ${artists.length} artist profiles`);
      logger(`Starting recieving artist profiles from twitter...`);
      sendDiscordMessage(
        'Updating artists information',
        `Recieved ${'`'}${artists.length}${'`'} artist profiles, updating`,
        'warning'
      );

      const requestsList = artists.map(
        (artist, index) =>
          new Promise(async resolve => {
            setTimeout(async () => {
              const data = await this.twitterClient.getTwitterUserByUserId(artist.twitterUserId);
              logger(`[${index + 1} / ${artists.length}] Fetched profile for user ${artist.username}`);
              resolve(data);
            }, index * this.FETCH_TIMEOUT);
          })
      );
      const parsedArtists: ParsedProfile[] = (await Promise.all(requestsList)) as ParsedProfile[];

      if (parsedArtists.length === 0) {
        logger('Recieved `0` artists profiles from twitter');
        return;
      }

      logger('Fetched all profiles from twitter');
      logger('Starting updating artists information...');

      const updatedArtists: Artist[] = artists.map((artist, index) => ({
        ...artist,
        name: parsedArtists[index]?.displayName || artist.name,
        username: parsedArtists[index]?.username || artist.username,
        images: {
          avatar: parsedArtists[index]?.avatarUrl || artist.images.avatar,
          banner: parsedArtists[index]?.bannerUrl || artist.images.banner,
        },
        bio: parsedArtists[index]?.biography || artist.bio,
        website: parsedArtists[index]?.website || artist.website,
        updatedAt: new Date(),
      }));
      const updatedArtistsWithRanking = this.calculateArtistsRanking(updatedArtists);

      const updatedArtistsProfilesResponse =
        await this.drizzleClient.updateArtistInformationBulk(updatedArtistsWithRanking);

      logger(`Successfully updated artists ${updatedArtistsProfilesResponse.items.length} profiles`);
      sendDiscordMessage(
        'Updating artists information',
        `Total updated artists: ${'`' + updatedArtistsProfilesResponse.items.length + '`'}`,
        'info'
      );

      if (updatedArtistsProfilesResponse.errors) {
        this.handleErrors(updatedArtistsProfilesResponse.errors, 'updating artists profiles');
      }
    } catch (e: any) {
      logger('Error while trying to update artists information:');
      logger(e.message);
      sendDiscordMessage(
        'Error while trying to update artists information',
        `${'```'}${e.reason}:\n${e.message}${'```'}`,
        'error'
      );
    }
  }

  async updateArtistsInformationWithTrends() {
    try {
      const artists = await this.drizzleClient.getArtistsProfiles();

      if (artists.length === 0) {
        logger('Recieved 0 artists profiles dotcreators-sun');
        return;
      }

      logger(`Recieved ${artists.length} artist profiles`);
      logger(`Starting recieving artist profiles from twitter...`);
      sendDiscordMessage(
        'Updating artists information',
        `Recieved ${'`'}${artists.length}${'`'} artist profiles, updating`,
        'warning'
      );

      const requestsList = artists.map(
        (artist, index) =>
          new Promise(async resolve => {
            setTimeout(async () => {
              const data = await this.twitterClient.getTwitterUserByUserId(artist.twitterUserId);
              logger(`[${index + 1} / ${artists.length}] Fetched profile for user ${artist.username}`);
              resolve(data);
            }, index * this.FETCH_TIMEOUT);
          })
      );
      const parsedArtists: ParsedProfile[] = (await Promise.all(requestsList)) as ParsedProfile[];

      if (parsedArtists.length === 0) {
        logger('Recieved `0` artists profiles from twitter');
        return;
      }

      logger('Fetched all profiles from twitter');
      logger('Starting updating artists information...');

      const updatedArtists: Artist[] = artists.map((artist, index) => ({
        ...artist,
        name: parsedArtists[index]?.displayName || artist.name,
        username: parsedArtists[index]?.username || artist.username,
        tweetsCount: parsedArtists[index]?.tweetsCount || artist.tweetsCount,
        followersCount: parsedArtists[index]?.followersCount || artist.followersCount,
        images: {
          avatar: parsedArtists[index]?.avatarUrl || artist.images.avatar,
          banner: parsedArtists[index]?.bannerUrl || artist.images.banner,
        },
        bio: parsedArtists[index]?.biography || artist.bio,
        website: parsedArtists[index]?.website || artist.website,
        updatedAt: new Date(),
      }));
      const updatedArtistsWithRanking = this.calculateArtistsRanking(updatedArtists);

      // Final responses
      const updatedArtistsTrendsResponse = await this.drizzleClient.updateTrendsInformationBulk(
        updatedArtistsWithRanking.map(artist => ({
          twitterUserId: artist.twitterUserId,
          followersCount: artist.followersCount,
          tweetsCount: artist.tweetsCount,
        }))
      );
      const updatedArtistsProfilesResponse =
        await this.drizzleClient.updateArtistInformationBulk(updatedArtistsWithRanking);
      const updatedArtistsPercentResponse = await this.drizzleClient.updateArtistsFollowersTweetsPercent();

      logger(
        `Successfully updated artists ${updatedArtistsProfilesResponse.items.length} profiles and trends ${updatedArtistsTrendsResponse.items.length}`
      );
      sendDiscordMessage(
        'Updating artists information',
        `Total updated artists with trends: ${'`' + updatedArtistsProfilesResponse.items.length + '`'}`,
        'info'
      );

      if (updatedArtistsProfilesResponse.errors) {
        this.handleErrors(updatedArtistsProfilesResponse.errors, 'updating artists profiles');
      }
      if (updatedArtistsTrendsResponse.errors) {
        this.handleErrors(updatedArtistsTrendsResponse.errors, 'updating artists trends');
      }
      if (updatedArtistsPercentResponse.errors) {
        this.handleErrors(updatedArtistsPercentResponse.errors, 'updating artists growing percent');
      }
    } catch (e: any) {
      logger('Error while trying to update artists information with trends:');
      logger(e.message);
      sendDiscordMessage(
        'Error while trying to update artists information',
        `${'```'}${e.reason}:\n${e.message}${'```'}`,
        'error'
      );
    }
  }

  async updateArtistsData() {
    const artists = await this.drizzleClient.getArtistsProfiles();

    if (artists.length === 0) {
      logger('Recieved 0 artists profiles');
      sendDiscordMessage('Updating artists data', `Recieved \`0\` artist profiles`, 'error');
      return;
    }

    logger(`Recieved ${artists.length} artist profiles`);
    logger(`Starting data gatheting from twitter...`);
    sendDiscordMessage(
      'Updating artists data',
      `Recieved \`${artists.length}\` artist profiles, starting data gatheting...`,
      'warning'
    );

    const parsedArtists: ParsedProfile[] = [];
    const failedRequests: {
      artist: Artist;
      attempt: number;
    }[] = [];

    const fetchArtistProfile = async (
      artist: Artist,
      index: number,
      attempt: number = 1
    ): Promise<{
      data: ParsedProfile | null;
      artist?: Artist;
      attempt?: number;
      error?: unknown;
    }> => {
      try {
        const d:
          | ParsedProfile
          | {
              error: string;
            } = await this.twitterClient.getTwitterUserByUserId(artist.twitterUserId);

        if ('error' in d) {
          logger(
            `[${index + 1} / ${artists.length}] Error fetching profile for user ${artist.username}, attempt ${attempt}`
          );
          return { data: null, error: d.error, artist, attempt };
        }

        logger(`[${index + 1} / ${artists.length}] Fetched profile for user ${artist.username}`);
        return { data: d };
      } catch (error) {
        logger(
          `[${index + 1} / ${artists.length}] Error fetching profile for user ${artist.username}, attempt ${attempt}`
        );
        return { data: null, error, artist, attempt };
      }
    };

    const requestsList = artists.map(
      (artist, index) =>
        new Promise(async resolve => {
          setTimeout(async () => {
            const result = await fetchArtistProfile(artist, index);
            resolve(result);
          }, index * this.FETCH_TIMEOUT);
        })
    );

    const results = await Promise.all(requestsList);
    results.forEach((result: any) => {
      if (result.error) {
        failedRequests.push({
          artist: result.artist,
          attempt: result.attempt,
        });
      } else {
        parsedArtists.push(result.data);
      }
    });

    let remainingFailed = [...failedRequests];
    const MAX_ATTEMPTS = 5;
    let currentAttempt = 2;

    while (remainingFailed.length > 0 && currentAttempt <= MAX_ATTEMPTS) {
      logger(`Retrying ${remainingFailed.length} failed profiles, attempt ${currentAttempt}`);
      const retryPromises = remainingFailed.map(
        (failed, index) =>
          new Promise(async resolve => {
            const backoffDelay = 5000 * Math.pow(2, currentAttempt - 1);
            setTimeout(async () => {
              const result = await fetchArtistProfile(failed.artist, artists.indexOf(failed.artist), currentAttempt);
              resolve(result);
            }, index * backoffDelay);
          })
      );

      const retryResults = await Promise.all(retryPromises);
      const newFailed: typeof failedRequests = [];
      remainingFailed = [];

      retryResults.forEach((result: any) => {
        if (result.error && result.attempt < MAX_ATTEMPTS) {
          newFailed.push({ artist: result.artist, attempt: result.attempt + 1 });
        } else if (!result.error) {
          parsedArtists.push(result.data);
        }
      });

      remainingFailed = newFailed;
      currentAttempt++;
    }

    if (remainingFailed.length > 0) {
      const failedIds = remainingFailed.map(f => f.artist.twitterUserId).join(', ');
      logger(`Failed to fetch ${remainingFailed.length} profiles after ${MAX_ATTEMPTS} attempts: ${failedIds}`);
      sendDiscordMessage(
        'Updating artists data',
        `Failed to fetch \`${remainingFailed.length}\` profiles after ${MAX_ATTEMPTS} attempts: ${failedIds}`,
        'error'
      );
    }

    logger('Fetched all profiles from twitter');
    logger('Starting updating artists information in dotcreators-sun...');

    parsedArtists.sort((a, b) => a.username.localeCompare(b.username));
    artists.sort((a, b) => a.username.localeCompare(b.username));

    try {
      const updatedArtists: Artist[] = artists.map(artist => {
        const parsedArtist = parsedArtists.find(p => p.userId === artist.twitterUserId);
        if (parsedArtist) {
          return {
            ...artist,
            name: parsedArtist.displayName || artist.name,
            username: parsedArtist.username || artist.username,
            tweetsCount: parsedArtist.tweetsCount || artist.tweetsCount,
            followersCount: parsedArtist.followersCount || artist.followersCount,
            images: {
              avatar: parsedArtist.avatarUrl || artist.images.avatar,
              banner: parsedArtist.bannerUrl || artist.images.banner,
            },
            bio: parsedArtist.biography || artist.bio,
            website: parsedArtist.website || artist.website,
            updatedAt: new Date(),
          };
        }
        return artist;
      });

      const updatedArtistsWithRanking = this.calculateArtistsRanking(updatedArtists);
      const updatedArtistsProfilesResponse =
        await this.drizzleClient.updateArtistInformationBulk(updatedArtistsWithRanking);
      const updatedArtistsTrendsResponse = await this.drizzleClient.updateTrendsInformationBulk(
        updatedArtistsWithRanking.map(artist => ({
          twitterUserId: artist.twitterUserId,
          followersCount: artist.followersCount,
          tweetsCount: artist.tweetsCount,
        }))
      );
      await this.drizzleClient.updateArtistsFollowersTweetsPercent();

      logger(
        `Successfully updated artists ${updatedArtistsProfilesResponse.items.length} profiles and trends ${updatedArtistsTrendsResponse.items.length}`
      );
      sendDiscordMessage(
        'Updating artists data',
        `Updated \`${updatedArtistsProfilesResponse.items.length}\` artists with \`${updatedArtistsTrendsResponse.items.length}\` trends`,
        'info'
      );
    } catch (error) {
      console.error('Error updating artists:', error);
      sendDiscordMessage('Updating artists data', `Error: \n\n${error}`, 'error');
    }
  }
}

export { DataGathering };
