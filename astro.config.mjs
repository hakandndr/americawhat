import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://americawhat.com',
  output: 'static',
  build: {
    format: 'directory',
  },
});
