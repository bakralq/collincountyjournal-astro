const IMAGE_ROOT = '/images/';
const OPTIMIZED_ROOT = '/images/_optimized/';

export const imageWidths = {
  card: [360, 640],
  rail: [360, 640],
  feature: [640, 1200],
  hero: [800, 1200],
};

export function getOptimizedImagePath(src, width, format = 'webp') {
  if (!src || typeof src !== 'string') return src;
  if (!src.startsWith(IMAGE_ROOT) || src.startsWith(OPTIMIZED_ROOT)) return src;

  const withoutRoot = src.slice(IMAGE_ROOT.length);
  const dotIndex = withoutRoot.lastIndexOf('.');
  const base = dotIndex >= 0 ? withoutRoot.slice(0, dotIndex) : withoutRoot;

  return `${OPTIMIZED_ROOT}${base}-${width}.${format}`;
}

export function getOptimizedSrcSet(src, widths, format = 'webp') {
  if (!src || typeof src !== 'string') return '';
  if (!src.startsWith(IMAGE_ROOT) || src.startsWith(OPTIMIZED_ROOT)) return '';

  return widths
    .map((width) => `${getOptimizedImagePath(src, width, format)} ${width}w`)
    .join(', ');
}
