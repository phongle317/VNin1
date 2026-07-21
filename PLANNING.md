# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

**How to resume:** say "let's resume" and share this file. Start at the
"NEXT SESSION — resume here" section below — it's kept current after every
session.

---

## STATUS (as of this session)

**Site is live at vnin1.vercel.app, stable, no known bugs.** All infra work
is done (see Tech stack / HTML entity decoding sections below). Content
Rules build plan (`CONTENT_RULES.md`) is well underway: Rules 1, 4, and
5(parts 1-2) are done and verified live. Nothing is mid-broken or
interrupted right now — this is a clean stopping point.

---

## NEXT SESSION — resume here

Nothing broken, nothing mid-push. Just pick the next Content Rules build
plan item and go. See `CONTENT_RULES.md` → "Build plan" for full detail;
summary below.

### Done and verified live (no action needed)
1. ~~Dedup across themes~~ (Rule 1)
2. ~~Blocklist expansion~~ (Rule 4)
3. ~~Training scorer activated~~ (Rule 5, parts 1-2) — 16 liked / 14
   disliked examples in `training.json`

### Up next, in order
1. **Add 4 new confirmed sources** (researched + RSS-verified this session,
   not yet coded) — expands 7 sources → 11:
   - **Vietstock** (VI): `vietstock.vn/757/tai-chinh/ngan-hang.rss` → Chứng
     khoán; `vietstock.vn/773/the-gioi/chung-khoan-the-gioi.rss` → International
   - **CafeBiz** (VI): `cafebiz.vn/rss/ngan-hang-tai-chinh.rss` → Chứng
     khoán/Vĩ mô; `cafebiz.vn/rss/bat-dong-san.rss` → Bất động sản;
     `cafebiz.vn/rss/dau-tu.rss` → Vĩ mô/Đầu tư
   - **MarketWatch** (EN): `feeds.content.dowjones.io/public/rss/mw_topstories`
     → International (NOTE: this is the real Dow-Jones-infrastructure RSS
     URL, different from the dead marketwatch.com link that was in the old
     hardcoded footer — that one was never a real RSS source, just a
     leftover broken link)
   - **WSJ** (EN): `feeds.content.dowjones.io/public/rss/RSSMarketsMain`
     → International (headline+excerpt only, free; full article paywalled,
     irrelevant since we never fetch full text anyway)
   - All 4 URLs fetch-tested this session, confirmed correct MIME type
     (`application/rss+xml` / `application/xml`) — not yet tested inside
     the actual `fetch-feeds.mjs` pipeline, so still run a real
     `npm run fetch` check after adding, same as any new source.
   - Deferred, lower confidence, check manually before adding:
     **NDH.vn** (possible reduced activity since ~2022 per a forum post —
     verify site is still updating before use), **Tinnhanhchungkhoan.vn**
     (site active, but no RSS URL found yet — needs more digging)
   - Not viable: **Reuters** (killed official RSS years ago, only
     available via unreliable third-party generators — skip)
2. **Cross-source content-similarity dedup (Rule 1b)** — new problem found
   this session, different from Rule 1. Rule 1's dedup only catches exact
   link matches (same feed reused across themes). This is a different case:
   **two different sources (e.g. CafeF and VnEconomy) both cover the same
   real-world event with different wording and different links** — e.g.
   both publishing near-identical "Hà Nội khởi công 5 tuyến đường sắt đô
   thị" stories, likely both rewriting the same press release. Exact-link
   dedup can't catch this since the articles are genuinely different URLs.

   **Approach confirmed (Cách 2):** piggyback on the Groq call already made
   in `scoreAndFilter()` for relevance scoring — extend that same prompt to
   also ask Groq to flag which headlines within the batch describe the same
   underlying event, then drop all but one (keep the one from the
   higher-priority source, same priority order as Rule 1's THEMES order).
   No extra API calls needed, reuses existing infrastructure. Rejected
   alternative: plain text/keyword similarity matching — cheaper but far
   less accurate for headlines phrased differently about the same event,
   which is exactly this failure mode.
3. **Theme-summary prompt revision** (Rule 3 — add explicit
   what/why/impact structure to the AI summary prompt) — quick prompt edit,
   no new architecture.
4. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   moderate scope, adds ~32 Groq calls/fetch (well within free-tier quota).
   Replaces the raw RSS excerpt currently shown on cards with a real
   AI-condensed 30-40 word summary per article.
5. **Bank/securities 30% quota logic** (Rule 5, part 3) — new feature,
   needs a sector-tagging step (how do we know an article is "about a bank
   or securities company"? keyword match on company names, or a separate
   Groq classification call?) before a quota check can run. Needs a design
   decision before coding starts.
6. **Recency vs. sharpness trade-off** — user asked about reducing
   article staleness on the live site (some articles showing 9h old while
   fresher ones exist). Root cause identified: `scoreAndFilter()`'s
   relevance score outweighs its small recency bonus, by design (Rule 5).
   User explicitly chose **Option C: leave as-is** this session — sharp
   analysis over freshness is intentional, not a bug. Revisit only if it
   starts feeling wrong in practice; the fix would be increasing the
   recency bonus weight in that function, or adding a hard "always keep
   newest N" floor per theme.
6. **Admin voting buttons (Like/Dislike/Block) on live site** — new
   feature, fully speced this session, not started. This is a real
   architecture change (adds a serverless API to an otherwise fully static
   site) — budget a full focused session, not a quick add.

   **What it does:** replaces manually typing lines into `EXAMPLES.md` with
   3 buttons under each article card, visible only to the user (admin).
   Clicking a button appends one line to the matching section of
   `EXAMPLES.md` on GitHub automatically — same effect as hand-editing, just
   automated. Does **not** touch `training.json` or `CONTENT_BLOCKLIST`
   directly; those still only get updated the existing way, in a session
   where the user brings `EXAMPLES.md` and Claude codes the entries in.

   **Confirmed spec (all decided, no open questions):**
   - Three buttons: Like, Dislike, Block — mutually exclusive, one per
     article, one click only (button locks/disables after use)
   - No multi-click weighting, no scoring — this was considered and
     explicitly rejected by the user in favor of simplicity
   - Buttons only visible when the site is loaded via a bookmarked URL
     containing a secret key the user will choose themselves (e.g.
     `https://vnin1.vercel.app/?key=<user's own secret string>`) — not real
     auth, just hides the buttons from normal visitors. User will supply
     the secret string when work begins; do not invent one.
   - On click: a small API endpoint (Vercel Serverless Function) reads the
     current `EXAMPLES.md` from GitHub, checks whether that article's title
     already appears anywhere in the file (dedup check), and if not, appends
     exactly `- <original headline text>` to the correct section (Block
     candidates / Liked / Disliked) and commits directly to GitHub.
   - Line format matches the user's existing manual convention exactly —
     just `- <headline>`, nothing else (no timestamp, no link, no source
     tag). Confirmed deliberately: keeps the file visually uniform whether
     a line was typed by hand or added by a button, and keeps it fast to
     scan.
   - `EXAMPLES.md` remains the single starting point/scratchpad exactly as
     today — this feature is only a faster way to add lines to it, not a
     new parallel system.

   **Known trade-off, already discussed and accepted:** since this commits
   to GitHub independently of the user's laptop (same pattern as the
   hourly feed bot), the user's **local** `EXAMPLES.md` can silently fall
   behind GitHub's copy after clicking buttons on the live site (e.g. from
   phone). User has been warned: always `git pull` before hand-editing
   `EXAMPLES.md` locally, same discipline as `feed.json`, to avoid
   overwriting button-added lines.

   **Decided 2026-07-20: no background auto-pull.** Considered using
   Windows Task Scheduler to run `git pull` automatically in the
   background, rejected — it would fail silently on the same
   uncommitted-`feed.json` conflict that's hit repeatedly this project,
   creating false confidence that local is synced when it might not be.
   Also, once the voting buttons are built, the user won't need to
   hand-edit `EXAMPLES.md` locally anymore (buttons replace that entirely),
   so the sync problem this would have solved mostly disappears on its
   own. `deploy.bat` already pulls before every push — that remains
   sufficient. If local verification of `EXAMPLES.md` is ever needed, a
   one-off manual `git pull` at that moment is enough; no standing
   automation needed.

   **Build components needed (none started):**
   - Vercel Serverless Function (new — first one in this project) that can
     write to GitHub (needs a GitHub token secret, separate from
     `GROQ_API_KEY`, added to Vercel's environment variables)
   - Duplicate-check logic (read `EXAMPLES.md`, search for the headline
     across all sections before appending)
   - Frontend: 3 buttons per card in `index.astro`, client-side JS to call
     the API, visual feedback on click (e.g. brief "✓ Recorded" state),
     button becomes disabled/hidden after a successful click for that card
   - `?key=` check gating whether buttons render at all — read the secret
     from a hardcoded value the user provides (do not overthink this into
     a real auth system, that was explicitly decided against)

### Ongoing, no fixed schedule
**`EXAMPLES.md`** — user adds liked/disliked/block-candidate headlines
whenever spotted on the live site. Bring the file (or new lines) to a
session whenever ready to "cash it in" — gets sorted into `training.json`
or `CONTENT_BLOCKLIST` as appropriate. Not urgent, no deadline. Once the
admin voting buttons (item 6 above) are built, most Liked/Disliked/Block
additions will come from button clicks instead of manual typing — but the
file and workflow itself don't change, just the input method.

---

## Established working rules (do not deviate)

These were hard-won this project via a long git-troubleshooting session.
Breaking them risks repeating that entire ordeal.

1. **All file edits happen locally only.** GitHub's web editor is never
   used for edits again (viewing files on GitHub to verify is fine).
2. **`deploy.bat` is the only way changes reach GitHub.** Never raw
   `git push` without going through it, since it has the pull-first safety
   step (though as this session showed, that step can still be blocked by
   uncommitted local `feed.json` changes — always `git checkout --
   src/data/feed.json` first if `deploy.bat`'s sync step fails).
3. **`src/data/feed.json` is bot-owned.** Never hand-edit it or expect it to
   stay stable locally — the hourly GitHub Action overwrites it constantly.
   `deploy.bat` deliberately excludes it from commits for this reason.
4. **Verify on GitHub/live site is read-only.** Never click any edit
   pencil icon on GitHub during verification steps.
5. **Every code change gets confirmed via an actual GitHub Actions run
   log**, not assumed from a local syntax check. (`node --check` only
   validates syntax, not runtime import resolution — this already caught
   us out once with the `he` package CommonJS/ESM issue.)
6. **`deploy.bat`'s pull step routinely gets blocked by local `feed.json`
   changes** — this happened repeatedly this session, not a one-off. The
   fix is always the same and always safe:
   ```
   git checkout -- src/data/feed.json
   deploy.bat
   ```
   Just run this reflexively if `deploy.bat` reports a sync error before
   investigating further — it's the local `feed.json` almost every time.

---

## Source attribution policy

Every news item displayed must carry proper source attribution. This is both
a legal and a trust requirement.

**Rules that apply to every card, always:**
- Display the outlet name visibly on every card
- Link the source name back to the outlet's homepage
- The article title links to the original article URL — never to this site
- Only title + RSS-provided excerpt (max ~160 chars) + link is stored/shown.
  Full article text is never fetched, stored, or displayed.
- AI-generated content (summaries, and per-article summaries once built) is
  clearly labeled so readers know it is not editorial content
- Footer must state clearly that this is an aggregator, not a publisher,
  with named links to each source outlet **that is actually being fetched**
  — footer is now dynamically derived from `theme.articles`, never hardcode
  this again

---

## Content — feeds and themes

Defined entirely in `THEMES` inside `scripts/fetch-feeds.mjs`. Adding a
source or theme = editing that config; nothing else in the codebase should
need to change.

**Current sources (7 total, 4 themes):**
- Chứng khoán: CafeF, VnEconomy, VnExpress, Thanh Niên
- Bất động sản: CafeF, VnEconomy, VnExpress, Thanh Niên
- Vĩ mô / Đầu tư: CafeF, VnEconomy, VnExpress, Thanh Niên
- International: CNBC, Financial Times, SCMP

**As of this session:** cross-theme dedup means a story appearing in
multiple themes' feeds now only shows in the first-matching theme (by
`THEMES` array order) — see Rule 1 in `CONTENT_RULES.md`.

**Content editorial rules:** see `CONTENT_RULES.md` — source of truth for
what/how content gets collected and summarized. See also `EXAMPLES.md` — the
running scratchpad of real liked/disliked/block-candidate headlines that
feeds into `CONTENT_RULES.md`'s rules over time.

---

## AI features (Groq)

Two Groq-powered features exist in `fetch-feeds.mjs` (a third is planned,
see Content Rules build plan):

1. **Theme summaries** (`generateSummary`) — 2-sentence Vietnamese wire-style
   summary per theme, shown at the top of each section, labeled "AI Summary".
   Prompt revision pending (Content Rules build plan, next up).
2. **Training scorer** (`scoreAndFilter`) — ✅ **active, verified live.**
   Scores articles against 16 liked / 14 disliked examples in
   `src/data/training.json`, filters + re-ranks by relevance + recency.
   Confirmed running on real hourly fetches (Actions log shows
   `Training filter: X/Y kept` per theme). Deliberately weighs sharp
   analysis over freshness — see "NEXT SESSION" open design question above.

Model: `llama-3.3-70b-versatile`. Endpoint: Groq's OpenAI-compatible chat
completions API. Secret: `GROQ_API_KEY` — confirmed correctly wired into
`update-feed.yml`'s `env:` block, working in production.

**Note:** an "article condensing" feature was described in very old planning
docs as if it existed — it does not, and never did, in the actual code.
This is now correctly tracked as an unbuilt feature under Content Rules
build plan, not a "broken" feature to debug.

---

## HTML entity decoding

Fixed previous session, carried forward as a permanent note: `stripTags()`
in `fetch-feeds.mjs` uses the `he` npm package's `decode()` function to
handle all HTML entities (named + numeric), fixing garbled Vietnamese text
from VnExpress and Thanh Niên feeds. Import must use the default-import
pattern (`import he from 'he'; const { decode } = he;`) — the direct named
import (`import { decode } from 'he'`) fails at runtime because `he` is a
CommonJS package, even though it passes a local syntax check. This is
documented here so nobody "simplifies" the import back to the broken form.

---

## Tech stack and hosting

| Concern        | Tool / Service                              |
|-----------------|---------------------------------------------|
| Framework       | Astro (static site generator)               |
| RSS parsing     | `fast-xml-parser`                            |
| HTML decoding   | `he` (npm package)                           |
| AI provider     | Groq API (`llama-3.3-70b-versatile`)         |
| Scheduling      | GitHub Actions cron (nominally hourly; real-world gaps of ~1-2.5hrs observed — platform limitation, not a bug) |
| Hosting         | Vercel (auto-deploy on GitHub push)          |
| Deployment      | `deploy.bat` (conflict-safe, pulls before push) |
| Domain          | None yet — free `.vercel.app` URL for now    |

---

## Open items — backlog, not blocking

1. **Top bar upgrade (VNIndex, VN30, %, khối lượng)** — user requested
   2026-07-21: add VNIndex points, VN30 points, % change, and trading
   volume to the sticky top bar, remove the "Thị trường đóng cửa — hiển thị
   giá đóng cửa gần nhất" explanatory text (always show latest available,
   no status caveat). This is really one bundled task, not separate small
   ones — don't ship the UI half without the data half, since a bar showing
   empty VNIndex/VN30 fields is worse than not having them.

   **Data blocker — VNDirect finfo API still down**, same root cause as
   item 2 below. `fetchMarketIndices()` in `fetch-feeds.mjs` already has
   the code to parse `change`/`changePercent`/`totalMatchVolume` — the
   fields needed for % and volume already exist in VNDirect's response
   shape, they're just never reached because the fetch itself fails.

   **Two replacement candidates researched 2026-07-21, not yet tested in
   code:**
   - **TCBS** (`apipubaws.tcbs.com.vn`) — public, no-auth endpoint, widely
     used by open-source VN stock tools (e.g. the `vnstock` Python library)
     as a VNDirect alternative. Confirmed real/live via multiple
     independent sources, but the exact JSON shape for an index snapshot
     (as opposed to per-stock historical bars) wasn't confirmed by URL —
     needs testing directly in `fetch-feeds.mjs`.
   - **FireAnt** (`restv2.fireant.vn`) — confirmed domain is live (fetched
     root page successfully). Their public dashboard
     (fireant.vn/dashboard) displays VNINDEX + HNXINDEX + VN30 together
     with point value, change, and % change in one place — exactly the
     shape needed. Underlying JSON API endpoint for this snapshot not
     confirmed by direct URL yet (search tooling couldn't reach deep
     enough to verify) — same "test it for real" step needed as TCBS.
   - **VN30 specifically** has no existing code at all (only VNIndex/HNX
     are coded today) — whichever source wins, VN30 parsing is new code,
     not just a URL swap.
   - Next session: try both candidates directly with a real
     `npm run fetch` test (same approach used for RSS sources this
     session) rather than trying to fully verify via search first — search
     confirmed both are legitimate/live but couldn't pin down exact JSON
     endpoints with certainty.

2. **VN-Index / HNX-Index (existing code path)** — VNDirect finfo API
   still failing (`fetch failed`). Superseded by item 1 above once a
   replacement source is wired in — this line can be deleted then.
3. **Gold VND** — both candidate sources still failing (giavang.org 404,
   api.btmc.vn fetch failed)
4. **README.md rewrite** — still describes an older/different state than
   reality in places; `PLANNING.md` (this file) is the accurate one
5. **CafeBiz occasional fetch failures** — observed intermittently
   2026-07-21 (different URL each time: `bat-dong-san.rss` once,
   `dau-tu.rss` another time), CafeF also failed once. Same category as
   VNDirect/giavang.org — source-side flakiness, not a code bug. Pipeline
   already handles this gracefully (skips, continues, no crash). Only
   worth revisiting if it starts happening on every run instead of
   occasionally.

---

## Change log

*Append a line here whenever a significant decision or fix lands.*

- Initial plan locked (two-column layout, homepage feeds only)
- Replaced with theme-grouped layout, category feeds, no source columns
- Site renamed WIRE.vn → VNin1
- International section added: CNBC, Financial Times, SCMP
- Sources expanded: VnExpress and Thanh Niên added across VI themes
- Global indices added: S&P 500, Nasdaq, Nikkei, Hang Seng, DAX (Yahoo)
- AI provider switched Gemini → Groq (`llama-3.3-70b-versatile`)
- Content-type blocklist filter added
- Training/scoring system built (liked/disliked examples) — inactive,
  awaiting real examples
- **Session N-1:** fixed missing `GROQ_API_KEY` env wiring in
  `update-feed.yml` — root cause of AI summaries silently failing
- **Session N-1:** fixed hardcoded footer source list → dynamic, derived
  from actual fetched sources
- **Session N-1:** established the 5 "working rules" (see above section) —
  a full local git-vs-GitHub divergence had to be recovered from; rules
  exist specifically to prevent repeating that
- **Session N-1:** fixed VnExpress/Thanh Niên HTML entity garbling via
  `he` package — required two attempts (first import syntax failed at
  runtime despite passing local syntax check)
- **This session:** `CONTENT_RULES.md` created — first 5 editorial rules
  established (no cross-theme duplicates, exact headlines, summary quality
  standard, hard exclusions, prioritization incl. 30% bank/securities quota)
- **This session:** cross-theme dedup logic written and verified live
  (Rule 1 — done)
- **This session:** `EXAMPLES.md` created — running scratchpad for real
  liked/disliked/block-candidate headlines, feeds into `CONTENT_RULES.md`
- **This session:** blocklist expanded from 16 real examples, tested
  (16/16 caught, 0/10 false positives), verified live (Rule 4 — done)
- **This session:** training scorer activated with first 16 liked / 14
  disliked examples, verified live (Rule 5 parts 1-2 — done). Sharp-
  analysis-over-freshness trade-off reviewed and deliberately kept.
