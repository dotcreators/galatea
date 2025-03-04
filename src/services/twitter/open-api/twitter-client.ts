import { TwitterOpenApi } from 'twitter-openapi-typescript';
import { ITwitterClient } from '../twitter-client.interface';
import { ParsedProfile } from '../models/parsed-profile';
import { formatBio } from '../../../utils';

export default class TwitterClient implements ITwitterClient {
  private readonly api = new TwitterOpenApi();

  private async getClient() {
    return await this.api.getGuestClient();
  }

  async getTwitterUserByUsername(
    username: string
  ): Promise<ParsedProfile | { error: string }> {
    const twitterClient = await this.getClient();
    const r = await twitterClient
      .getUserApi()
      .getUserByScreenName({ screenName: username });

    if (r && r.data && r.data.user) {
      const profile: ParsedProfile = {
        userId: r.data.user.restId,
        username: r.data.user.legacy.screenName,
        followersCount: r.data.user.legacy.normalFollowersCount,
        tweetsCount: r.data.user.legacy.statusesCount,
        url: `https://x.com/${r.data.user.legacy.screenName}`,
        avatarUrl: r.data.user.legacy.profileImageUrlHttps.replace(
          '_normal',
          ''
        ),
        bannerUrl: r.data.user.legacy.profileBannerUrl,
        displayName: r.data.user.legacy.name,
        biography: await formatBio(r.data.user.legacy.description),
        website: r.data.user.legacy.entities.url
          ? r.data.user.legacy.entities.url.urls[0].expanded_url
          : null,
        createdAt: new Date(r.data.user.legacy.createdAt).toISOString(),
      };

      return profile;
    } else {
      return { error: 'Unable to find requested user' };
    }
  }

  async getTwitterUserByUserId(
    userId: string
  ): Promise<ParsedProfile | { error: string }> {
    const twitterClient = await this.getClient();
    const r = await twitterClient
      .getUserApi()
      .getUserByRestId({ userId: userId });

    if (r && r.data && r.data.user) {
      const profile: ParsedProfile = {
        userId: r.data.user.restId,
        username: r.data.user.legacy.screenName,
        followersCount: r.data.user.legacy.normalFollowersCount,
        tweetsCount: r.data.user.legacy.statusesCount,
        url: `https://x.com/${r.data.user.legacy.screenName}`,
        avatarUrl: r.data.user.legacy.profileImageUrlHttps.replace(
          '_normal',
          ''
        ),
        bannerUrl: r.data.user.legacy.profileBannerUrl,
        displayName: r.data.user.legacy.name,
        biography: await formatBio(r.data.user.legacy.description),
        website: r.data.user.legacy.entities.url
          ? r.data.user.legacy.entities.url.urls[0].expanded_url
          : null,
        createdAt: new Date(r.data.user.legacy.createdAt).toISOString(),
      };

      return profile;
    } else {
      return { error: 'Unable to find requested user' };
    }
  }
}
