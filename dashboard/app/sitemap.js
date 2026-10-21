import { topics } from './docs/topics.mjs';
import { publicUpdates } from './changelog/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function sitemap() {
  const pages = ['/', '/pricing', '/calculator', '/buy', '/docs', '/changelog', '/terms', '/privacy', ...topics.map(({ slug }) => `/docs/${slug}`)].map((path) => ({ url: `https://ai.axiomcreative.xyz${path}` }));
  return [...pages, ...publicUpdates().map(item => ({ url: `https://ai.axiomcreative.xyz/changelog/${item.slug}`, lastModified: item.updated_at }))];
}
