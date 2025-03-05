import { startCronUpdateStats } from './services/cron';
import { logger } from './utils';

logger('Service started.');

startCronUpdateStats();
