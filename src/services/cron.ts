import cron from 'node-cron';
import { logger } from '../utils';
import { sendDiscordMessage } from './discord-webhook';
import { envConfig } from '../../env.config';
import DrizzleClient from './database/drizzle/drizzle-client';
import TwitterClient from './twitter/open-api/twitter-client';
import { ParsedProfile } from './twitter/models/parsed-profile';
import { Artist } from './database/drizzle/schema/artists';

const EVERY_HOURS = 24;
const FETCH_TIMEOUT = 3000;

function startCronUpdateStats() {
  cron.schedule(
    `0 0 */${EVERY_HOURS} * * *`,
    async () => updateArtistsInformation(),
    {
      name: 'Update followers and tweets count for artists (pfp/banner/bio and etc).',
      runOnInit: envConfig.RUN_ON_START,
    }
  );
}

function startCronFetchArtistSuggestion() {
  cron.schedule(
    `0 0 */${EVERY_HOURS} * * *`,
    async () => {
      throw new Error('Not implemented');
    },
    {
      name: 'Fetching suggested artists profiles.',
      runOnInit: envConfig.RUN_ON_START,
    }
  );
}

/**
 * Updates artists information by fetching profiles from dotcreators-sun and Twitter,
 * then updating the information in the database.
 *
 * @async
 * @function updateArtistsInformation
 */
async function updateArtistsInformation(): Promise<void> {
  logger('Starting fetching artist profiles from dotcreatros-sun...');

  try {
    const drizzleClient = new DrizzleClient();
    const twitterClient = new TwitterClient();

    const artistProfiles = await drizzleClient.getArtistsProfiles();

    if (artistProfiles.length === 0) {
      logger('Recieved 0 artists profiles dotcreators-sun');
      return;
    }

    logger(`Recieved ${artistProfiles.length} artist profiles`);
    logger(`Starting recieving artist profiles from twitter...`);
    sendDiscordMessage(
      'Updating artists information',
      `Recieved ${'`'}${artistProfiles.length}${'`'} artist profiles, updating`,
      'info'
    );

    const reqList = artistProfiles.map(
      (artist, index) =>
        new Promise(async resolve => {
          setTimeout(async () => {
            const data = await twitterClient.getTwitterUserByUserId(
              artist.twitterUserId
            );
            logger(
              `[${index + 1} / ${artistProfiles.length}] Fetched profile for user ${artist.username}`
            );
            resolve(data);
          }, index * FETCH_TIMEOUT);
        })
    );

    const artistsInformation: ParsedProfile[] = (await Promise.all(
      reqList
    )) as ParsedProfile[];

    if (artistsInformation.length === 0) {
      logger('Recieved `0` artists profiles from twitter');
      return;
    }

    logger('Fetched all profiles from twitter');
    logger('Starting updating artists information...');

    const updatedArtistsProfiles: Artist[] = artistProfiles.map(
      (artist, index) => ({
        ...artist,
        name: artistsInformation[index]?.displayName || artist.name,
        username: artistsInformation[index]?.username || artist.username,
        tweetsCount:
          artistsInformation[index]?.tweetsCount || artist.tweetsCount,
        followersCount:
          artistsInformation[index]?.followersCount || artist.followersCount,
        images: {
          avatar: artistsInformation[index]?.avatarUrl || artist.images.avatar,
          banner: artistsInformation[index]?.bannerUrl || artist.images.banner,
        },
        bio: artistsInformation[index]?.biography || artist.bio,
        website: artistsInformation[index]?.website || artist.website,
        updatedAt: new Date(),
      })
    );

    const updatedArtistsTrendsResponse =
      await drizzleClient.updateTrendsInformationBulk(
        updatedArtistsProfiles.map(artist => ({
          twitterUserId: artist.twitterUserId,
          followersCount: artist.followersCount,
          tweetsCount: artist.tweetsCount,
        }))
      );

    const updatedArtistsProfilesResponse =
      await drizzleClient.updateArtistInformationBulk(updatedArtistsProfiles);

    const updatePercent =
      await drizzleClient.updateArtistsFollowersTweetsPercent();

    logger(
      `Successfully updated artists ${updatedArtistsProfilesResponse.items.length} profiles and trends ${updatedArtistsTrendsResponse.items.length}`
    );
    sendDiscordMessage(
      'Updating artists information',
      `Successfully updated:\nTotal updated artists: ${'`' + updatedArtistsProfilesResponse.items.length + '`'}`,
      'info'
    );

    if (updatePercent.errors && updatePercent.errors.length > 0) {
      logger(`Errors ${updatePercent.errors.length}:`);
      logger(updatePercent.errors.map(error => error.description).join(', '));

      if (updatePercent.errors.length > 0) {
        updatePercent.errors.forEach(element => {
          sendDiscordMessage(
            'Error while updating artist percent change',
            `${'```'}${element.reason}:\n${element.description}${'```'}`,
            'error'
          );
        });
      }
    }

    if (
      updatedArtistsProfilesResponse.errors &&
      updatedArtistsProfilesResponse.errors.length > 0
    ) {
      logger(`Errors ${updatedArtistsProfilesResponse.errors.length}:`);
      logger(
        updatedArtistsProfilesResponse.errors
          .map(error => error.description)
          .join(', ')
      );

      if (updatedArtistsProfilesResponse.errors.length > 0) {
        updatedArtistsProfilesResponse.errors.forEach(element => {
          sendDiscordMessage(
            'Error while updating artist profile',
            `${'```'}${element.reason}:\n${element.description}${'```'}`,
            'error'
          );
        });
      }
    }

    if (
      updatedArtistsTrendsResponse.errors &&
      updatedArtistsTrendsResponse.errors.length > 0
    ) {
      logger(`Errors ${updatedArtistsTrendsResponse.errors.length}:`);
      logger(
        updatedArtistsTrendsResponse.errors
          .map(error => error.description)
          .join(', ')
      );

      updatedArtistsTrendsResponse.errors.forEach(element => {
        sendDiscordMessage(
          'Error while updating artist trends',
          `${'```'}${element.reason}:\n${element.description}${'```'}`,
          'error'
        );
      });
    } else {
      logger('Successfully updated artists information');
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

export { startCronUpdateStats, startCronFetchArtistSuggestion };
