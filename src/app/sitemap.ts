import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proximo-paso.netlify.app';
  const now = new Date();
  return [
    { url: `${site}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${site}/registro`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${site}/ayuda`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/privacidad`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/verificar`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
