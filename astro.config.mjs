import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://americawhat.com',
  output: 'static',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      // Keep the sitemap to indexable HTML pages only (drop the RSS endpoint).
      filter: (page) => !page.includes('/rss.xml'),
    }),
  ],
});
