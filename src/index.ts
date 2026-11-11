import { testGetArtistProfile } from 'tests';
import { startCronUpdateStats } from './services/cron';
import { logger } from './utils/utils';

logger('Service started.');
startCronUpdateStats();
testGetArtistProfile('cyangmou');
