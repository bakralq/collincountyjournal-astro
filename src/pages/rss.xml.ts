import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site?: URL }) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  const sortedPosts = posts.sort(
    (a, b) =>
      new Date(`${b.data.date}T12:00:00`).getTime() -
      new Date(`${a.data.date}T12:00:00`).getTime()
  );

  return rss({
    title: 'The Princeton Journal',
    description: 'Princeton’s leading source for local news, governance coverage, and community reporting.',
    site: context.site?.toString() || 'https://theprincetonjournal.com',
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: new Date(`${post.data.date}T12:00:00`),
      link: `/posts/${post.id.replace(/\.md$/, '')}`,
    })),
    customData: `<language>en-us</language>`,
  });
}
