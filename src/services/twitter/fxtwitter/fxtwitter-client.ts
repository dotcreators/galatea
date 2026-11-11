import { FetchProfileResult } from '../models/fetch-profile-result';
import { formatBio } from '../../../utils/utils';

type FxTwitterUser = {
  id: string;
  screen_name: string;
  name?: string;
  description?: string;
  followers?: number;
  tweets?: number;
  avatar_url?: string;
  banner_url?: string;
  joined?: string;
  website?: { url?: string } | null;
};

type FxTwitterResponse = {
  code: number;
  message: string;
  user?: FxTwitterUser;
};

const FXTWITTER_URL = 'https://api.fxtwitter.com';
const REQUEST_TIMEOUT = 15000;

export default class FxTwitterClient {
  async getTwitterUserByUsername(username: string): Promise<FetchProfileResult> {
    try {
      const response = await fetch(`${FXTWITTER_URL}/${encodeURIComponent(username)}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      const data = (await response.json()) as FxTwitterResponse;

      if (data.code === 200 && data.user) {
        const user = data.user;
        return {
          status: 'ok',
          profile: {
            userId: user.id,
            username: user.screen_name,
            displayName: user.name,
            followersCount: user.followers ?? 0,
            tweetsCount: user.tweets ?? 0,
            url: `https://x.com/${user.screen_name}`,
            avatarUrl: user.avatar_url?.replace('_normal', ''),
            bannerUrl: user.banner_url,
            biography: await formatBio(user.description ?? ''),
            website: user.website?.url || undefined,
            createdAt: user.joined ? new Date(user.joined).toISOString() : new Date().toISOString(),
          },
        };
      }

      if (data.code === 404) {
        return /suspended/i.test(data.message) ? { status: 'suspended' } : { status: 'not_found' };
      }

      return { status: 'error', message: `FxTwitter ${data.code}: ${data.message}` };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }
}
