import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-metadata';

/**
 * The whole operation center stays out of search. Disallow "/" without naming
 * private routes, so this file does not disclose app paths.
 * The sitemap address is allowed so crawlers can read an empty map.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/sitemap.xml'],
      disallow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
