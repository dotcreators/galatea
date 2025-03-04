import { Response } from './drizzle/models/response';
import { Artist, ArtistTrend } from './drizzle/schema/artists';

export interface IDatabaseClient
  extends IArtistsDatabaseClient,
    ITrendsDatabaseClient {}

export interface IArtistsDatabaseClient {
  getArtistsProfiles(): Promise<
    {
      username: string;
      twitterUserId: string;
    }[]
  >;
  updateArtistInformationBulk(
    artistsData: Artist[]
  ): Promise<Response<Artist[]>>;
}

export interface ITrendsDatabaseClient {
  updateTrendsInformationBulk(
    trendData: ArtistTrend[]
  ): Promise<Response<ArtistTrend[]>>;
}
