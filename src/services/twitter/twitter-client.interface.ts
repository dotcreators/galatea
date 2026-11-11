import { FetchProfileResult } from './models/fetch-profile-result';

export interface ITwitterClient {
  getTwitterUserByUsername(username: string): Promise<FetchProfileResult>;
  getTwitterUserByUserId(userId: string): Promise<FetchProfileResult>;
}
