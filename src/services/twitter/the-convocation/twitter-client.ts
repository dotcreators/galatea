import { ITwitterClient } from '../twitter-client.interface';
import { ParsedProfile } from '../models/parsed-profile';
import { formatBio } from '../../../utils';
import { Scraper } from '@the-convocation/twitter-scraper';

const REQUEST_TIMEOUT = 5000;

export default class TwitterClient implements ITwitterClient {
  private readonly api = new Scraper({
    transform: {
      request(input: RequestInfo | URL, init: RequestInit = {}) {
        init.signal = AbortSignal.timeout(REQUEST_TIMEOUT);

        return [input, init];
      },
    },
  });

  async getTwitterUserByUsername(
    username: string
  ): Promise<ParsedProfile | { error: string }> {
    const r = await this.api.getProfile(username);

    if (r) {
      const profile: ParsedProfile = {
        userId: r.userId!,
        username: r.username!,
        followersCount: r.followersCount!,
        tweetsCount: r.tweetsCount!,
        url: `https://x.com/${r.username}`,
        avatarUrl: r.avatar!.replace('_normal', ''),
        bannerUrl: r.banner,
        displayName: r.name,
        biography: await formatBio(r.biography!),
        website: r.website,
        createdAt: new Date(r.joined!).toISOString(),
      };

      return profile;
    } else {
      return { error: 'Unable to find requested user' };
    }
  }

  async getTwitterUserByUserId(
    userId: string
  ): Promise<ParsedProfile | { error: string }> {
    throw Error('Method not implemented');
  }
}
