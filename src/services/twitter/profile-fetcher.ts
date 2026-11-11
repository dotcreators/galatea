import { ParsedProfile } from './models/parsed-profile';
import { FetchProfileResult, ProfileSource } from './models/fetch-profile-result';
import TwitterClient from './open-api/twitter-client';
import FxTwitterClient from './fxtwitter/fxtwitter-client';
import { logger } from 'utils/logger';

export type ArtistFetchResult =
  | { status: 'ok'; profile: ParsedProfile; source: ProfileSource }
  | { status: 'not_found' }
  | { status: 'suspended' }
  | { status: 'error'; message: string };

type ArtistIdentity = { twitterUserId: string; username: string };

const ID_LOOKUP_FAILURE_LIMIT = 5;

export default class ProfileFetcher {
  private readonly twitterClient = new TwitterClient();
  private readonly fxTwitterClient = new FxTwitterClient();
  private idLookupFailures = 0;

  resetIdLookup() {
    this.idLookupFailures = 0;
  }

  get isIdLookupDisabled() {
    return this.idLookupFailures >= ID_LOOKUP_FAILURE_LIMIT;
  }

  async fetch(artist: ArtistIdentity): Promise<ArtistFetchResult> {
    if (!this.isIdLookupDisabled) {
      const byId = await this.twitterClient.getTwitterUserByUserId(artist.twitterUserId);

      if (byId.status === 'ok') {
        this.idLookupFailures = 0;
        return { ...byId, source: 'id' };
      }
      if (byId.status === 'error') {
        this.idLookupFailures++;
        if (this.isIdLookupDisabled) {
          logger.warn(`Lookup by id failed ${ID_LOOKUP_FAILURE_LIMIT} times in a row, disabling it: ${byId.message}`);
        }
      }
    }

    const byUsername = this.matchArtist(artist, await this.twitterClient.getTwitterUserByUsername(artist.username));
    if (byUsername.status === 'ok') return { ...byUsername, source: 'username' };

    const byFxTwitter = this.matchArtist(artist, await this.fxTwitterClient.getTwitterUserByUsername(artist.username));
    if (byFxTwitter.status === 'ok') return { ...byFxTwitter, source: 'fxtwitter' };

    if (byFxTwitter.status === 'suspended') return { status: 'suspended' };
    if (byFxTwitter.status === 'not_found') return { status: 'not_found' };

    return {
      status: 'error',
      message: [byUsername, byFxTwitter]
        .map(result => (result.status === 'error' ? result.message : result.status))
        .join('; '),
    };
  }

  private matchArtist(artist: ArtistIdentity, result: FetchProfileResult): FetchProfileResult {
    if (result.status !== 'ok' || result.profile.userId === artist.twitterUserId) return result;

    logger.warn(
      `Username ${artist.username} now belongs to ${result.profile.userId}, expected ${artist.twitterUserId}`
    );
    return { status: 'not_found' };
  }
}
