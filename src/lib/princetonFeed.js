const FEED_URL = 'https://theprincetonjournal.com/rss.xml';
const SITE_URL = 'https://theprincetonjournal.com';
const CACHE_TTL_MS = 5 * 60 * 1000;

function getFeedCache() {
  return globalThis.__ccjPrincetonFeedCache;
}

function setFeedCache(items) {
  globalThis.__ccjPrincetonFeedCache = {
    fetchedAt: Date.now(),
    items,
  };
}

function decodeEntities(value = '') {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripTags(value = '') {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function getMetaContent(html, metaKey) {
  const escapedKey = metaKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    {
      pattern: new RegExp(`<meta[^>]+property=(["'])${escapedKey}\\1[^>]+content=(["'])(.*?)\\2[^>]*>`, 'i'),
      index: 3,
    },
    {
      pattern: new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]+property=(["'])${escapedKey}\\3[^>]*>`, 'i'),
      index: 2,
    },
    {
      pattern: new RegExp(`<meta[^>]+name=(["'])${escapedKey}\\1[^>]+content=(["'])(.*?)\\2[^>]*>`, 'i'),
      index: 3,
    },
    {
      pattern: new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]+name=(["'])${escapedKey}\\3[^>]*>`, 'i'),
      index: 2,
    },
  ];

  for (const { pattern, index } of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[index].trim());
  }

  return '';
}

function normalizeUrl(url = '') {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractImage(block) {
  const mediaMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch) return normalizeUrl(mediaMatch[1]);

  const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
  if (enclosureMatch) return normalizeUrl(enclosureMatch[1]);

  const description = extractTag(block, 'description');
  const contentEncoded = extractTag(block, 'content:encoded');
  const combined = `${description} ${contentEncoded}`;
  const imageMatch = combined.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imageMatch ? normalizeUrl(imageMatch[1]) : '';
}

async function getArticleImage(articleUrl) {
  try {
    const response = await fetch(articleUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return '';

    const html = await response.text();
    return normalizeUrl(
      getMetaContent(html, 'og:image') ||
      getMetaContent(html, 'twitter:image')
    );
  } catch {
    return '';
  }
}

export async function getPrincetonFeed(limit = 4) {
  const cached = getFeedCache();

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items.slice(0, limit);
  }

  try {
    const response = await fetch(FEED_URL, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const items = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi));
    const parsedItems = items
      .map((match) => {
        const block = match[0];
        const title = stripTags(extractTag(block, 'title'));
        const link = normalizeUrl(decodeEntities(extractTag(block, 'link')));
        const description = stripTags(extractTag(block, 'description'));
        const pubDate = decodeEntities(extractTag(block, 'pubDate'));
        const image = extractImage(block);

        return { title, link, description, pubDate, image };
      })
      .filter((item) => item.title && item.link)
      .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime())
      .slice(0, limit);

    const enrichedItems = await Promise.all(
      parsedItems.map(async (item) => ({
        ...item,
        image: item.image || await getArticleImage(item.link),
      }))
    );

    setFeedCache(enrichedItems);

    return enrichedItems;
  } catch (error) {
    return cached?.items.slice(0, limit) ?? [];
  }
}
