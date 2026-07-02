# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

---

## Guiding principle: build for change, not for permanence

This project will evolve — sources will be added or dropped, themes will be
renamed, the AI provider may change, the domain will eventually arrive, layout
preferences will shift. Every decision below is made with this in mind.

**The rule:** nothing is hard-coded that could reasonably change. Sources,
themes, AI providers, market data endpoints, branding, and section order all
live in configuration, not scattered through templates. When something new
comes up, the question to ask first is: "can this be a config change rather
than a code change?" If the answer is yes, build it that way. If something
genuinely cannot be made dynamic (e.g. a structural layout change), flag it
before building and discuss the tradeoff.

This principle applies to every file written from here forward.

---

## Status

**Planning locked. Not yet implemented.**

The current code in the repo (two-column CafeF/VnEconomy split) reflects the
old layout decision and needs to be fully replaced per this plan.

---

## Audience & goal

Real product for other people to use, not a personal reading tool.

That sets the bar on:
- Clear branding and site name (visitors have no background context)
- A footer/about line explaining what the site is and is not
- Source attribution on every card — proper, visible, consistent
- A custom domain eventually (buy after MVP confirmed working, not before)

---

## Source attribution policy

Every news item displayed must carry proper source attribution. This is both
a legal and a trust requirement.

**Rules that apply to every card, always:**
- Display the outlet name visibly on every card (e.g. "CafeF", "VnEconomy")
- Link the source name back to the outlet's homepage
- The article title links to the original article URL — never to this site
- Only title + RSS-provided excerpt (max ~160 chars) + link is stored/shown.
  Full article text is never fetched, stored, or displayed.
- AI-generated summaries are clearly labeled as AI-generated
  ("Tóm tắt tự động" or similar) so readers know it is not editorial content
- Footer must state clearly that this is an aggregator, not a publisher,
  with named links to each source outlet

These rules must be preserved even as sources are added or layout changes.
They are not cosmetic — they define what kind of site this legally is.

---

## Content — feeds and themes

### Architecture

Articles are tagged with two fields: `theme` (for grouping on the page) and
`source` (for the badge). This is the core data model going forward.

Themes and sources are defined entirely in a config object inside
`scripts/fetch-feeds.mjs`. Adding a new source or theme = adding to the
config, nothing else changes in the rest of the codebase.

### Current themes and feed URLs

| Theme key    | Display name (VI)        | CafeF feed URL                    | VnEconomy feed URL                        |
|--------------|--------------------------|-----------------------------------|-------------------------------------------|
| `stocks`     | Chứng khoán              | `thi-truong-chung-khoan.rss`      | `chung-khoan.rss`                         |
| `realestate` | Bất động sản             | `bat-dong-san.rss`                | `dia-oc.rss`                              |
| `macro`      | Vĩ mô / Đầu tư           | `vi-mo-dau-tu.rss`                | `dau-tu.rss` ← verify vs `tieu-diem.rss` |

Each feed entry in config carries: `sourceId`, `sourceName`, `sourceUrl`
(homepage), `theme`, `feedUrl`, `attribution` (display string for cards).

### Adding a third source later

Add a new source block per theme in the config. The page template loops over
whatever is in the config — no template changes needed. This was an explicit
design goal.

### Open item: macro feed mapping

VnEconomy's `dau-tu.rss` vs `tieu-diem.rss` — verify which gives more
relevant macro/investment volume by fetching both live during the first build
session. Pick the better one and update the config.

---

## Market data — index bar

A sticky bar at the top of the page showing live/recent VN market numbers.

### Data sources (decided)

| Indicator   | Source                          | Format | Auth needed |
|-------------|----------------------------------|--------|-------------|
| VN-Index    | VNDirect finfo API               | JSON   | None        |
| HNX-Index   | VNDirect finfo API               | JSON   | None        |
| USD/VND     | State Bank of Vietnam (SBV) feed | XML    | None        |

VNDirect endpoint: `https://finfo-api.vndirect.com.vn/v4/...`
SBV endpoint: official daily exchange rate XML feed

### Flexibility note

These endpoints are unofficial (VNDirect) and official (SBV). If VNDirect's
endpoint breaks in future, the fallback is to fetch the same index value from
investing.com or cafef.vn. The fetch logic should have a `candidateUrls`
array for the market data source, same pattern as the RSS feeds.

### Display rules

- VN market trades 9am–3pm VN time, weekdays only
- Outside trading hours: show last known closing value + label
  "Thị trường đóng cửa" — never present a stale number as live
- Change indicator: green for positive, red for negative (matching VN
  market convention — red = down, green = up, opposite of Western convention)
- Market data is fetched in the same hourly GitHub Actions run as the news

---

## AI theme summaries

A 2–3 sentence Vietnamese-language summary at the top of each theme section,
auto-generated from that hour's headlines and excerpts.

### How it works

1. After RSS fetch, group articles by theme
2. For each theme, send headlines + excerpts to Gemini API
3. Prompt: summarise what is moving in this theme today, in Vietnamese,
   2–3 sentences, based only on the provided headlines — no speculation
4. Store returned summary in `feed.json` under each theme
5. Astro renders the summary above the cards at build time
6. Label it clearly as AI-generated on the page

### AI provider: Google Gemini (AI Studio)

- Free tier: 1,500 requests/day, no credit card, no expiry
- Site needs max 72 calls/day (3 themes × 24 runs) — well under limit
- Model: `gemini-2.5-flash`
- Key stored as GitHub Actions secret: `GEMINI_API_KEY`
- Sign up: aistudio.google.com with a Google account

### Flexibility note

The AI provider call is isolated in its own function in `fetch-feeds.mjs`.
Swapping Gemini for another provider = changing one function, not the whole
script. The interface (in: array of headlines → out: summary string) stays
constant regardless of which provider is behind it.

### Limitation to communicate to users

The AI only reads headlines and RSS excerpts — not full article bodies. The
summary describes headline-level patterns, not deep analysis. This must be
clear on the page via the "Tóm tắt tự động" label.

---

## Layout

### Page structure (top to bottom)

1. **Sticky ticker bar** — market indices (VN-Index, HNX, USD/VND) +
   freshness indicator (last sync time, green/amber/red dot)
2. **Masthead** — site name + tagline (blocked on branding decision)
3. **Theme sections** (one per theme, in configurable order):
   - Section header (theme display name)
   - AI summary block, labeled "Tóm tắt tự động · Gemini"
   - Card list: headline + excerpt + source badge + time ago
4. **Footer** — aggregator disclaimer + source links + attribution

### Card design rules

- Title links to original article (opens in new tab)
- Source badge: outlet name + links to outlet homepage
- Time shown as relative ("2 giờ trước") not absolute, using VN locale
- Hover state: left gold border highlight
- No images on cards (RSS image support is inconsistent across VN outlets;
  adding images is a future decision when a reliable source is confirmed)

### What is not on the page (decided explicitly)

- No unified "All / Latest" section at the top — themes only
- No search or filtering (v2+ decision)
- No user accounts or saved articles (v2+ decision)
- No side-by-side source columns — themes are the structure, not sources

### Section order

Defer until real headlines are visible in each section. Easier to judge with
live data. Default order for first build: Chứng khoán → Bất động sản →
Vĩ mô. Can be changed by reordering the config array — no template change
needed.

### Flexibility note

Section order, number of sections, and section display names all live in
config. The page template loops over whatever the config provides. Adding,
removing, or reordering a section = one line change in the config.

---

## Branding

- **Working name:** `WIRE.vn` (placeholder — not final)
- **Status:** blocked on user sharing the actual name
- Once name is confirmed: update nameplate, favicon, footer copy, Vercel
  project name, and `astro.config.mjs` site field
- **Domain:** buy only after MVP is confirmed live and stable. Use free
  `.vercel.app` URL until then.

---

## Tech stack and hosting (not changing)

| Concern        | Tool / Service                              |
|----------------|---------------------------------------------|
| Framework      | Astro (static site generator)               |
| RSS parsing    | `fast-xml-parser`                           |
| AI summaries   | Google Gemini API (via `fetch`)             |
| Scheduling     | GitHub Actions cron (hourly)                |
| Hosting        | Vercel (auto-deploy on GitHub push)         |
| Domain         | None yet — free `.vercel.app` URL for now   |

All secrets (only `GEMINI_API_KEY` for now) live in GitHub Actions secrets,
never in code or committed files.

---

## Open items — must resolve before or during build

1. **Site name** — user has one in mind; share it to unblock branding
2. **VnEconomy macro feed** — verify `dau-tu.rss` vs `tieu-diem.rss` live
3. **Section order** — decide after seeing real headlines per theme
4. **VNDirect finfo endpoint** — confirm exact URL for VN-Index and HNX
   during first build session (test before committing to it)

---

## Known future decisions (not blocking, log here when they land)

- De-duplication of same-event stories across sources (v3 idea)
- Third news source — slot into config when ready, no layout change needed
- Thumbnail images on cards — only when a source provides them consistently
- Email digest / newsletter — different product, different infrastructure
- Custom domain — buy after MVP confirmed stable
- VnEconomy written approval — get this if/when site is monetised or scaled

---

## Step-by-step build guide
### How to use this section
Work through these steps in order. Do not skip ahead. At the start of each
session, say "let's resume" and share this file — the session picks up at
the first incomplete step. Each step is self-contained: it has a clear goal,
what to do, and how to confirm it worked.

Mark steps done by checking the box: [ ] → [x]

---

### PHASE 0 — Prerequisites (do before any coding)

- [ ] **0a. Site name** — share the site name so branding can be applied
      throughout. Everything named `WIRE.vn` is a placeholder until this lands.

- [ ] **0b. Gemini API key** — go to aistudio.google.com, sign in with Google,
      click "Get API key", copy the key. You will add it in step 1c below.
      Do not paste the key anywhere in the code or this file.

---

### PHASE 1 — Fetch script rebuild (`scripts/fetch-feeds.mjs`)

Goal: one script that fetches all RSS feeds by theme, fetches market data,
calls Gemini for summaries, and writes a single `src/data/feed.json`.

- [ ] **1a. Rebuild source/theme config** — replace the two flat source
      entries with the theme-keyed config structure. Verify all 6 feed URLs
      are reachable. Resolve the VnEconomy macro feed open item here.

- [ ] **1b. Market data fetch** — add VNDirect finfo fetch for VN-Index and
      HNX-Index. Add SBV fetch for USD/VND. Confirm both return data.
      Add `candidateUrls` fallback arrays for both, same pattern as RSS feeds.

- [ ] **1c. Gemini summary integration** — add the AI summary call per theme.
      Add `GEMINI_API_KEY` as a secret in GitHub Actions before testing.
      Confirm summaries are returned in Vietnamese and stored in `feed.json`.

- [ ] **1d. Local test** — run `npm run fetch` locally. Inspect `feed.json`
      and confirm: 3 themes present, each with articles from both sources,
      a market data block, and an AI summary. Fix anything missing.

---

### PHASE 2 — Page rebuild (`src/pages/index.astro`)

Goal: replace the two-column layout with the theme-grouped design.

- [ ] **2a. Ticker bar** — update to show VN-Index, HNX-Index, USD/VND from
      `feed.json` alongside the existing freshness dot. Add market-closed
      label logic for outside 9am–3pm VN time on weekdays.

- [ ] **2b. Theme sections** — replace two-column grid with a loop over themes
      from `feed.json`. Each section: header, AI summary block (labeled
      "Tóm tắt tự động · Gemini"), card list.

- [ ] **2c. Card attribution** — confirm every card shows source badge linking
      to outlet homepage. Confirm article title links to original article URL.
      Confirm AI summary is visually distinct and labeled.

- [ ] **2d. Footer** — add aggregator disclaimer, links to CafeF and VnEconomy,
      statement that full content belongs to the original outlets.

- [ ] **2e. Local preview** — run `npm run fetch && npm run dev`. Check the
      page in a browser. Confirm all sections render, all links work, source
      attribution is visible on every card.

---

### PHASE 3 — Branding (blocked on step 0a)

- [ ] **3a. Apply site name** — update nameplate in `Layout.astro`, favicon
      SVG, footer copy, `astro.config.mjs`, and Vercel project name.

- [ ] **3b. Tagline** — add one-sentence description below the nameplate.
      Example pattern: "[Name] — Tin tài chính Việt Nam, gọn và nhanh."

---

### PHASE 4 — GitHub and Vercel deploy

- [ ] **4a. Init git and push** — `git init`, `git add .`, first commit,
      push to a new GitHub repo. Confirm all files including `PLANNING.md`
      and `README.md` are present on GitHub.

- [ ] **4b. Add GitHub Actions secret** — in the GitHub repo → Settings →
      Secrets → Actions → add `GEMINI_API_KEY`. (If not done in step 1c.)

- [ ] **4c. Connect Vercel** — go to vercel.com, import the GitHub repo,
      confirm Astro is auto-detected, deploy. Note the `.vercel.app` URL.

- [ ] **4d. Confirm first live build** — visit the live URL. Confirm the
      page renders with real headlines, market data, and AI summaries.

- [ ] **4e. Confirm scheduled Action** — wait for the next hourly run
      (or trigger manually via GitHub Actions tab). Confirm it commits new
      `feed.json` data and Vercel picks it up within a minute or two.

---

### PHASE 5 — Post-launch tuning (do after site is live)

- [ ] **5a. Section order** — review real headlines in each theme section.
      Reorder by changing the config array order. One line, no template change.

- [ ] **5b. Macro feed** — if `dau-tu.rss` turns out thin or off-topic,
      swap to `tieu-diem.rss` in the config. One line change.

- [ ] **5c. Domain** — once satisfied with the live site, buy domain and
      connect in Vercel settings. Update `site:` in `astro.config.mjs`.

---

## Change log
*Append a line here whenever a significant decision changes after being locked.*

- Initial plan locked (two-column layout, homepage feeds only)
- Replaced with theme-grouped layout, category feeds, no source columns
- Added Priority 1–4 enhancements: tagline, market bar, AI summaries
- Market data source decided: VNDirect finfo API + SBV for USD/VND
- AI provider decided: Google Gemini (AI Studio), free tier, `gemini-2.5-flash`
- Source attribution policy formalised as a standing rule
- Flexibility-first principle adopted: all sources, themes, section order,
  and AI provider must be config-driven, not hard-coded
- Build guide added as step-by-step checklist replacing free-form next steps
