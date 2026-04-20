import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { getPostTimestamp } from '../lib/cityJournalData';

export async function GET(context: { site?: URL }) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const sortedPosts = posts.sort(
    (a, b) =>
      getPostTimestamp(b.data.date, b.data.publishedAt) -
      getPostTimestamp(a.data.date, a.data.publishedAt)
  );

  return rss({
    title: 'Collin County Journal',
    description:
      'Independent local reporting across Collin County, including city hall, growth, schools, public safety, and community coverage.',
    site: context.site?.toString() || 'https://collincountyjournal.com',
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: new Date(post.data.publishedAt || `${post.data.date}T12:00:00`),
      link: `/posts/${post.id.replace(/\.md$/, '')}`,
    })),
    customData: `<language>en-us</language>`,
  });
}
