import { defineConfig } from 'astro/config';

export default defineConfig({
  // No custom domain yet — Vercel/Cloudflare Pages will assign a free subdomain.
  // Once you buy a domain, you can set `site: 'https://yourdomain.com'` here for better SEO tags.
  output: 'static'
});
