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
        'info'
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
        'info'
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
}

export { DataGathering };
