import { TwitterOpenApi, TwitterOpenApiClient } from 'twitter-openapi-typescript';
import { ITwitterClient } from '../twitter-client.interface';
import { ParsedProfile } from '../models/parsed-profile';
import { FetchProfileResult } from '../models/fetch-profile-result';
import { formatBio } from '../../../utils/utils';

type RawUser = {
  restId?: string;
  core?: { screenName?: string; name?: string; createdAt?: string };
  avatar?: { imageUrl?: string };
  banner?: { imageUrl?: string };
  website?: { url?: string };
  profileBio?: { description?: string };
  relationshipCounts?: { followers?: number };
  tweetCounts?: { tweets?: number };
  legacy?: {
    screenName?: string;
    name?: string;
    createdAt?: string;
    normalFollowersCount?: number;
    followersCount?: number;
    statusesCount?: number;
    profileImageUrlHttps?: string;
    profileBannerUrl?: string;
    description?: string;
    entities?: { url?: { urls?: { expanded_url?: string; expandedUrl?: string }[] } };
  };
};

async function parseUser(user: RawUser): Promise<ParsedProfile | null> {
  const legacy = user.legacy ?? {};
  const username = user.core?.screenName ?? legacy.screenName;

  if (!user.restId || !username) return null;

  const createdAt = user.core?.createdAt ?? legacy.createdAt;
  const avatarUrl = user.avatar?.imageUrl ?? legacy.profileImageUrlHttps;
  const websiteEntity = legacy.entities?.url?.urls?.[0];
  const website = user.website?.url || websiteEntity?.expanded_url || websiteEntity?.expandedUrl;

  return {
    userId: user.restId,
    username,
    displayName: user.core?.name ?? legacy.name,
    followersCount: legacy.normalFollowersCount ?? legacy.followersCount ?? user.relationshipCounts?.followers ?? 0,
    tweetsCount: legacy.statusesCount ?? user.tweetCounts?.tweets ?? 0,
    url: `https://x.com/${username}`,
    avatarUrl: avatarUrl?.replace('_normal', ''),
    bannerUrl: user.banner?.imageUrl ?? legacy.profileBannerUrl,
    biography: await formatBio(user.profileBio?.description ?? legacy.description ?? ''),
    website: website || undefined,
    createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
  };
}

export default class TwitterClient implements ITwitterClient {
  private readonly api = new TwitterOpenApi();
  private client: Promise<TwitterOpenApiClient> | null = null;

  private getClient(): Promise<TwitterOpenApiClient> {
    if (!this.client) {
      this.client = this.api.getGuestClient().catch(error => {
        this.client = null;
        throw error;
      });
    }
    return this.client;
  }

  async getTwitterUserByUsername(username: string): Promise<FetchProfileResult> {
    return this.request(client => client.getUserApi().getUserByScreenName({ screenName: username }));
  }

  async getTwitterUserByUserId(userId: string): Promise<FetchProfileResult> {
    return this.request(client => client.getUserApi().getUserByRestId({ userId }));
  }

  private async request(
    call: (client: TwitterOpenApiClient) => Promise<{ data: { user?: unknown } }>
  ): Promise<FetchProfileResult> {
    try {
      const response = await call(await this.getClient());
      const profile = response?.data?.user ? await parseUser(response.data.user as RawUser) : null;
      return profile ? { status: 'ok', profile } : { status: 'not_found' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'No data') return { status: 'not_found' };

      const httpStatus = (error as { response?: { status?: number } })?.response?.status;
      this.client = null;
      return { status: 'error', message: httpStatus ? `${message} (HTTP ${httpStatus})` : message };
    }
  }
}
