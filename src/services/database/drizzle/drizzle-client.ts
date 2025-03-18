import { Artist, artists, artistsSuggestions, artistsTrends, ArtistTrend } from './schema/artists';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzleConfig } from './drizzle.config';
import { IDatabaseClient } from '../database-client.interface';
import { and, eq, gte, ne } from 'drizzle-orm';
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
    return await this.client.query.artists.findMany({
      where: ne(artists.isEnabled, false),
    });
  }

  async updateArtistInformationBulk(artistsData: Artist[]): Promise<Response<Artist[]>> {
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

  async updateArtistsFollowersTweetsPercent(): Promise<Response<Artist[]>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trends = await this.client
      .select()
      .from(artistsTrends)
      .where(and(gte(artistsTrends.createdAt, sevenDaysAgo), ne(artists.isEnabled, false)))
      .execute();

    const trendsByArtist = trends.reduce(
      (acc, trend) => {
        if (!acc[trend.twitterUserId]) {
          acc[trend.twitterUserId] = [];
        }
        acc[trend.twitterUserId].push(trend);
        return acc;
      },
      {} as Record<string, ArtistTrend[]>
    );

    const updatePromises = Object.keys(trendsByArtist).map(async twitterUserId => {
      const artistTrends = trendsByArtist[twitterUserId];
      const sortedTrends = artistTrends.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const oldestTrend = sortedTrends[0];
      const latestTrend = sortedTrends[sortedTrends.length - 1];

      const followersChangePercent =
        ((latestTrend.followersCount - oldestTrend.followersCount) / oldestTrend.followersCount) * 100;
      const tweetsChangePercent = ((latestTrend.tweetsCount - oldestTrend.tweetsCount) / oldestTrend.tweetsCount) * 100;

      return this.client
        .update(artists)
        .set({
          weeklyFollowersTrend: followersChangePercent,
          weeklyTweetsTrend: tweetsChangePercent,
        })
        .where(eq(artists.twitterUserId, twitterUserId))
        .returning()
        .execute();
    });

    const updateResults = await Promise.allSettled(updatePromises);

    const errorResults: ErrorResponse[] = [];
    const processedResults = updateResults
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value[0];
        } else {
          errorResults.push({
            reason: result.reason,
            description: Object.keys(trendsByArtist)[index],
          });
          return null;
        }
      })
      .filter(Boolean) as Artist[];

    return { items: processedResults, errors: errorResults };
  }
}
