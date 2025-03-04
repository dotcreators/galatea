import { ParsedProfile } from './models/parsed-profile';

export interface ITwitterClient {
  getTwitterUserByUsername(
    username: string
  ): Promise<ParsedProfile | { error: string }>;
  getTwitterUserByUserId(
    userId: string
  ): Promise<ParsedProfile | { error: string }>;
}
