import { ParsedProfile } from './parsed-profile';

export type ProfileSource = 'id' | 'username' | 'fxtwitter';

export type FetchProfileResult =
  | { status: 'ok'; profile: ParsedProfile }
  | { status: 'not_found' }
  | { status: 'suspended' }
  | { status: 'error'; message: string };
