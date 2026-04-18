import { getCollection } from 'astro:content';

export async function GET() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  // Only last 48 hours (Google News requirement)
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);

  const recentPosts = posts.filter((post) => {
    const postDate = new Date(post.data.date);
    return postDate >= twoDaysAgo;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
          xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
    ${recentPosts
      .map((post) => {
        const url = `https://collincountyjournal.com/posts/${post.id.replace(/\\.md$/, '')}`;
        const pubDate = new Date(post.data.date).toISOString();

        return `
        <url>
          <loc>${url}</loc>
          <news:news>
            <news:publication>
              <news:name>Collin County Journal</news:name>
              <news:language>en</news:language>
            </news:publication>
            <news:publication_date>${pubDate}</news:publication_date>
            <news:title>${post.data.title}</news:title>
          </news:news>
        </url>`;
      })
      .join('')}
  </urlset>`;

  return new Response(xml.trim(), {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
