const PRINCETON_RSS_URL = 'https://theprincetonjournal.com/rss.xml';
const PRINCETON_SITE_URL = 'https://theprincetonjournal.com';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type PrincetonFeedCard = {
  title: string;
  description: string;
  date: string | null;
  href: string;
  image: string | null;
  readingTime: number | null;
};

type FeedCache = {
  fetchedAt: number;
  items: PrincetonFeedCard[];
};

declare global {
  var __ccjPrincetonFeedCache: FeedCache | undefined;
}

function decodeEntities(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getTagValue(source: string, tagName: string) {
  const match = source.match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  );

  return match ? decodeEntities(match[1].trim()) : '';
}

function getMetaContent(html: string, metaKey: string) {
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

function normalizeDate(pubDate: string) {
  const parsed = new Date(pubDate);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeLink(link: string) {
  if (!link) return PRINCETON_SITE_URL;
  if (link.startsWith('http://') || link.startsWith('https://')) return link;
  return `${PRINCETON_SITE_URL}${link.startsWith('/') ? '' : '/'}${link}`;
}

function normalizeImage(image: string) {
  if (!image) return null;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${PRINCETON_SITE_URL}${image.startsWith('/') ? '' : '/'}${image}`;
}

function parsePrincetonFeed(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const item = match[1];
      const title = getTagValue(item, 'title');
      const description = getTagValue(item, 'description');
      const link = normalizeLink(getTagValue(item, 'link'));
      const date = normalizeDate(getTagValue(item, 'pubDate'));

      return {
        title,
        description,
        date,
        href: link,
        image: null,
        readingTime: null,
      };
    })
    .filter((item) => item.title && item.href);
}

async function getArticleImage(articleUrl: string) {
  try {
    const response = await fetch(articleUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const image =
      getMetaContent(html, 'og:image') ||
      getMetaContent(html, 'twitter:image');

    return normalizeImage(image);
  } catch {
    return null;
  }
}

export async function getPrincetonFeed(limit = 3) {
  const cached = globalThis.__ccjPrincetonFeedCache;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items.slice(0, limit);
  }

  try {
    const response = await fetch(PRINCETON_RSS_URL, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Princeton RSS: ${response.status}`);
    }

    const xml = await response.text();
    const baseItems = parsePrincetonFeed(xml).slice(0, limit);
    const items = await Promise.all(
      baseItems.map(async (item) => ({
        ...item,
        image: await getArticleImage(item.href),
      }))
    );

    globalThis.__ccjPrincetonFeedCache = {
      fetchedAt: Date.now(),
      items,
    };

    return items;
  } catch (error) {
    console.warn('Unable to load Princeton RSS feed for Collin County Journal.', error);
    return cached?.items.slice(0, limit) ?? [];
  }
}
