import { testGetArtistProfile } from 'tests';
import { startCronUpdateStats } from './services/cron';
import { logger } from './utils';

logger('Service started.');
startCronUpdateStats();
// testGetArtistProfile('1349150508125192192');
