export type ParsedProfile = {
  userId: string;
  username: string;
  tweetsCount: number;
  followersCount: number;
  url: string;
  createdAt: string;
  displayName?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  website?: string;
  biography?: string;
};
