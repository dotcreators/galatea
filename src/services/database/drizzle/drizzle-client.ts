import {
  Artist,
  artists,
  artistsSuggestions,
  artistsTrends,
  ArtistTrend,
} from './schema/artists';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzleConfig } from './drizzle.config';
import { IDatabaseClient } from '../database-client.interface';
import { eq } from 'drizzle-orm';
import { ErrorResponse, Response } from './models/response';

export default class DrizzleClient implements IDatabaseClient {
  private client;

  constructor() {
    this.client = drizzle({
      connection: {
        connectionString: drizzleConfig.DATABASE_CONNECTION_URL,
      },
      schema: { artists, artistsSuggestions, artistsTrends },
    });
  }

  async getArtistsProfiles(): Promise<Artist[]> {
    return await this.client.query.artists.findMany();
  }

  async updateArtistInformationBulk(
    artistsData: Artist[]
  ): Promise<Response<Artist[]>> {
    const promises = artistsData.map(profile => {
      return this.client
        .update(artists)
        .set({ ...profile })
        .where(eq(artists.id, profile.id))
        .returning()
        .execute();
    });

    const results = await Promise.allSettled(promises);

    const errorResults: ErrorResponse[] = [];
    const processedResults = results
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value[0];
        } else {
          errorResults.push({
            reason: result.reason,
            description: artistsData[index]!.id,
          });
          return null;
        }
      })
      .filter(Boolean) as Artist[];

    return { items: processedResults, errors: errorResults };
  }

  async updateTrendsInformationBulk(
    trendData: Omit<ArtistTrend, 'id' | 'createdAt'>[]
  ): Promise<Response<ArtistTrend[]>> {
    if (!this.client) throw Error('Client is not initialized');

    const promises = trendData.map(trend => {
      return this.client
        .insert(artistsTrends)
        .values({
          followersCount: trend.followersCount,
          tweetsCount: trend.tweetsCount,
          twitterUserId: trend.twitterUserId,
          createdAt: new Date(),
        })
        .returning()
        .execute();
    });

    const results = await Promise.allSettled(promises);

    let errorResults: ErrorResponse[] = [];
    const processedResults = results
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value[0];
        } else {
          errorResults.push({
            reason: result.reason,
            description: trendData[index]!.twitterUserId,
          });
          return null;
        }
      })
      .filter(result => result !== null) as Artist[];

    return { items: processedResults, errors: errorResults };
  }
}
