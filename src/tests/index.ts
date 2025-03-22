import DrizzleClient from 'services/database/drizzle/drizzle-client';
import { Artist } from 'services/database/drizzle/schema/artists';
import { ParsedProfile } from 'services/twitter/models/parsed-profile';
import TwitterClient from 'services/twitter/open-api/twitter-client';

const drizzleClient = new DrizzleClient();
const twitterClient = new TwitterClient();

async function testTrendingCalculation() {
  try {
    const a = await drizzleClient.getArtistsProfiles('1287977244023914496');
    const artist: Artist = a[0];

    const parsedArtist = (await twitterClient.getTwitterUserByUserId(artist.twitterUserId)) as ParsedProfile;

    if (!parsedArtist) throw Error('Unable to fetch artist profile');

    const updatedArtist: Artist = {
      ...artist,
      name: parsedArtist.displayName || artist.name,
      username: parsedArtist.username || artist.username,
      images: {
        avatar: parsedArtist.avatarUrl || artist.images.avatar,
        banner: parsedArtist.bannerUrl || artist.images.banner,
      },
      bio: parsedArtist.biography || artist.bio,
      website: parsedArtist.website || artist.website,
      updatedAt: new Date(),
    };

    const updatedArtistsInfo = await drizzleClient.updateArtistInformationBulk([updatedArtist]);
    const updatedArtistsTrendsResponse = await drizzleClient.updateTrendsInformationBulk([
      {
        twitterUserId: updatedArtist.twitterUserId,
        followersCount: updatedArtist.followersCount,
        tweetsCount: updatedArtist.tweetsCount,
      },
    ]);
    const updatedArtistsPercentResponse = await drizzleClient.updateArtistsFollowersTweetsPercent();

    console.log('updatedArtistsInfo', updatedArtistsInfo);
    console.log('updatedArtistsTrendsResponse', updatedArtistsTrendsResponse);
    console.log('updatedArtistsPercentResponse', updatedArtistsPercentResponse);
  } catch (e) {
    console.log(e);
  }
}

export { testTrendingCalculation };
