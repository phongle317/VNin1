# WIRE.vn — CafeF + VnEconomy daily feed

A static news-wire landing page that pulls the latest headlines from CafeF.vn
and VnEconomy's public RSS feeds, refreshes itself automatically every hour,
and redeploys with no manual work after the first setup.

## How it stays running for "many days" with no babysitting

1. A GitHub Actions workflow (`.github/workflows/update-feed.yml`) runs on a
   cron schedule every hour, forever, for free (GitHub gives 2,000 free
   build-minutes/month; this job uses under a minute per run).
2. It re-fetches both RSS feeds, writes the result to `src/data/feed.json`,
   and — only if anything changed — commits and pushes that file back to
   your `main` branch.
3. Vercel (or Cloudflare Pages) is connected to that GitHub repo, so every
   push automatically triggers a fresh build and deploy. You never touch it
   again.

So once steps below are done once, the site keeps itself current on its own.

---

## Step 1 — Try it locally (optional but recommended)

You'll need [Node.js 18+](https://nodejs.org) installed.

```bash
cd news-aggregator
npm install
npm run fetch     # pulls live headlines into src/data/feed.json
npm run dev        # starts a local preview at http://localhost:4321
```

If `npm run fetch` prints `⚠` warnings for a source, that source's RSS path
may have changed — see Troubleshooting below. The site still builds fine
with whatever data it has (even zero, on a first run).

## Step 2 — Push this project to GitHub

1. Go to [github.com/new](https://github.com/new) and create a new
   **public or private** repository (e.g. `wire-vn`). Don't add a README/
   .gitignore there — you already have one.
2. In your terminal, from inside the `news-aggregator` folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wire-vn.git
git push -u origin main
```

## Step 3 — Deploy on Vercel (free, no domain needed)

1. Go to [vercel.com](https://vercel.com) and sign up/log in with your
   GitHub account.
2. Click **Add New → Project**, then select the `wire-vn` repo you just
   pushed.
3. Vercel auto-detects Astro — leave the default build settings
   (`npm run build`, output directory `dist`) and click **Deploy**.
4. After ~1 minute you'll get a free URL like `wire-vn.vercel.app`. That's
   your live site — no domain purchase required.

(Cloudflare Pages works the same way if you'd rather use that — connect the
GitHub repo, framework preset "Astro", same build command.)

## Step 4 — Let the scheduled workflow take over

Nothing else to do — `.github/workflows/update-feed.yml` is already in the
repo and starts running on its own schedule as soon as it's on `main`. You
can confirm it's working:

1. Go to your repo on GitHub → **Actions** tab.
2. You should see "Update news feed" runs appear hourly.
3. Each successful run that finds new headlines pushes a commit → Vercel
   picks that up → your live site updates within a minute or two.

You can also trigger it manually any time: Actions tab → "Update news feed"
→ **Run workflow**.

---

## Project structure

```
news-aggregator/
├── scripts/fetch-feeds.mjs       # fetches + parses both RSS feeds
├── src/
│   ├── data/feed.json            # output of the fetch script (auto-updated)
│   ├── layouts/Layout.astro      # fonts, colors, global styles
│   └── pages/index.astro         # the page itself
├── public/favicon.svg
└── .github/workflows/update-feed.yml   # the hourly automation
```

## Adding a source, or changing fetch frequency

- Sources are listed in `scripts/fetch-feeds.mjs` under `SOURCES`. Add another
  object with `id`, `name`, `attribution`, `homepage`, and `candidateUrls`
  (an RSS URL, or a few fallbacks) to bring in a third outlet later.
- Cron schedule lives in `.github/workflows/update-feed.yml` —
  `'5 * * * *'` means "every hour at minute 5". Use a site like
  [crontab.guru](https://crontab.guru) if you want a different cadence
  (e.g. `*/15 * * * *` for every 15 minutes).

## Content & copyright notes

- The site never stores full article text — only the title, the short
  summary the publisher already includes in their own RSS feed, and a link
  back to the original article. This mirrors how any RSS reader works.
- Every card is labeled with its source ("Theo CafeF" / "Theo VnEconomy")
  per their published RSS reuse terms.
- VnEconomy's site terms state that **republishing full articles** requires
  their written approval. Headline + RSS-provided summary + link-back (what
  this project does) is standard aggregation practice, not republishing —
  but if you ever plan to monetize this site or scale it seriously, it's
  worth emailing VnEconomy for an explicit yes, just to be safe.
- If either outlet asks you to stop, the safest move is to drop their
  `SOURCES` entry immediately.

## Troubleshooting

**A source shows 0 articles / `error` field is set in feed.json.**
The site's RSS path probably changed. Visit `https://cafef.vn/rss.html` or
`https://vneconomy.vn/rss.html` in a browser, copy the current feed URL, and
update `candidateUrls` in `scripts/fetch-feeds.mjs`.

**Build fails on Vercel but works locally.**
Check the Vercel deployment logs — almost always a missing dependency or
Node version mismatch. This project targets Node 18+; Vercel's default is
fine.

**I want a custom domain later.**
Vercel → your project → Settings → Domains → add your purchased domain and
follow their DNS instructions. No code changes needed; you can also set
`site: 'https://yourdomain.com'` in `astro.config.mjs` afterward for slightly
better SEO metadata.
