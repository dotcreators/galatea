export function logger(text: string) {
  console.log(
    `[${new Date().toLocaleDateString('en-EN')} ${new Date().toLocaleTimeString()}] ${text}`
  );
}

export async function getOriginalUrl(shortenedUrl: string): Promise<string> {
  try {
    const response = await fetch(shortenedUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    if (response.headers && response.headers.get('location')) {
      return response.headers.get('location')!;
    } else {
      console.log('No location header found in response.');
      return shortenedUrl;
    }
  } catch (error) {
    console.error('Error fetching original URL:', error);
    return shortenedUrl;
  }
}

export async function formatBio(bio: string): Promise<string> {
  const regex = /https?:\/\/(?:www\.|(?!www))[^\s.]+(?:\.[^\s.]+)+(?:\w\/?)*/gi;
  const matches = bio.match(regex);

  if (matches) {
    const promises = matches.map(async link => {
      const originalUrl = await getOriginalUrl(link);
      return originalUrl || '';
    });

    let index = 0;
    const newBioArray = await Promise.all(promises);
    const processedBio = bio.replace(regex, () => newBioArray[index++] || '');

    return processedBio;
  }

  return bio;
}
