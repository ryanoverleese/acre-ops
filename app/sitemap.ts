import type { MetadataRoute } from 'next';

/**
 * Required sitemap file. Intentionally empty: this is a private staff app, and
 * listing screens or token links would disclose them to crawlers.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
