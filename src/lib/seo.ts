import { getCityConfigBySection } from './cityJournalData';

export const SITE_URL = 'https://collincountyjournal.com';

export const PUBLISHER = {
  '@type': 'Organization',
  name: 'Collin County Journal',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/ccj-logo.jpg`,
  },
  sameAs: ['https://www.facebook.com/profile.php?id=61581999665231'],
};

export const AUTHOR_PROFILES = {
  'Christian J. Remington': {
    '@type': 'Person',
    name: 'Christian J. Remington',
    url: `${SITE_URL}/staff#christian-j-remington`,
  },
  'Zay Norvell': {
    '@type': 'Person',
    name: 'Zay Norvell',
    url: `${SITE_URL}/staff#zay-norvell`,
  },
};

const AUTHOR_ALIASES = {
  'Christian J. Remington, Editor in Chief': 'Christian J. Remington',
  'Zay Norvell, Research Contributor': 'Zay Norvell',
};

export const toAbsoluteUrl = (value = '') => {
  if (!value) return SITE_URL;
  return new URL(value, SITE_URL).toString();
};

export const normalizeAuthorName = (name = '') => AUTHOR_ALIASES[name] || name;

export const getAuthorProfile = (name = '') => {
  const normalizedName = normalizeAuthorName(name);

  return AUTHOR_PROFILES[normalizedName] || {
    '@type': 'Person',
    name: normalizedName,
    url: `${SITE_URL}/staff`,
  };
};

export const getSectionHref = (section = '') => {
  if (!section) return null;

  const city = getCityConfigBySection(section);

  if (city && !city.external) {
    return city.href;
  }

  if (section === 'US News') {
    return '/us-news';
  }

  return null;
};

export const buildBreadcrumbSchema = (items = []) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: toAbsoluteUrl(item.item),
  })),
});

export const buildCollectionPageSchema = ({
  name,
  description,
  url,
  items = [],
}) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name,
  description,
  url: toAbsoluteUrl(url),
  isPartOf: {
    '@type': 'WebSite',
    name: 'Collin County Journal',
    url: SITE_URL,
  },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: toAbsoluteUrl(item.url),
      name: item.name,
    })),
  },
});
