import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  // No custom domain yet — Vercel/Cloudflare Pages will assign a free subdomain.
  // Once you buy a domain, you can set `site: 'https://yourdomain.com'` here for better SEO tags.

  // Changed from 'static' to 'hybrid' — this keeps every existing page
  // static by default (same as before, no behavior change for the news
  // pages), but now ALSO allows specific pages/API routes to opt into
  // server rendering when needed (required for the upcoming Like/Dislike/
  // Block buttons, which need a real server endpoint to write to GitHub).
  output: 'hybrid',
  adapter: vercel(),
});
