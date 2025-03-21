import cron from 'node-cron';
import { envConfig } from '../../../env.config';
import { DataGathering } from './data-gathering';

const EVERY_HOURS = 24;

const dataGathering = new DataGathering();

function startCronUpdateStats() {
  cron.schedule(`0 0 */${EVERY_HOURS} * * *`, async () => dataGathering.updateArtistsInformationWithTrends(), {
    name: 'Update followers and tweets count for artists (pfp/banner/bio and etc).',
    runOnInit: envConfig.RUN_ON_START,
  });
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

export { startCronUpdateStats, startCronFetchArtistSuggestion };
