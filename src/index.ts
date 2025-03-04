import {
  cronFetchArtistSuggestion,
  cronUpdateStats,
  UpdateArtists,
} from './services/cron';
import { logger } from './utils';

logger('Service started.');

// Start cron services
// cronFetchArtistSuggestion();
// cronUpdateStats();
UpdateArtists();
