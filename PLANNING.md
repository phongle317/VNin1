# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

**How to resume:** say "let's resume" and share this file. Start at the
"NEXT SESSION — resume here" section below — it's kept current after every
session.

---

## STATUS (as of this session)

**Site is live at vnin1.vercel.app, stable, no known bugs.** Today's
session: refreshed source list (10 sources, added 4 + removed 1), built
cross-source content-similarity dedup (Rule 1b), hardened Groq calls
against rate-limit/truncation issues, and revised the theme-summary prompt
to add the impact/consequence component (Rule 3, theme-level half). All
verified live via real Actions runs, not just local testing. Content Rules
build plan (`CONTENT_RULES.md`) is well underway: Rules 1, 1b, 3
(theme-level), 4, and 5(parts 1-2) are done and verified live. Nothing is
mid-broken or interrupted right now — this is a clean stopping point.

---

## Legal note — Nghị định 174/2026/NĐ-CP (added 2026-07-21)

User asked whether this project risks violating Vietnamese press-copyright
regulation effective 1/7/2026. Researched via web search (not legal
advice — Claude is not a lawyer, flagged explicitly to the user).

**The rule:** Điều 95, Khoản 1, Điểm d — fines 20-30 million VND for
"cung cấp, chia sẻ tác phẩm báo chí... mà không được sự đồng ý của chủ thể
quyền sở hữu trí tuệ" (providing/sharing press works without IP rights
holder consent).

**Key distinction found across multiple legal-commentary sources:**
sharing a link to the original article is explicitly NOT considered a
violation (helps readers reach the source, doesn't replace it). What's
targeted: verbatim full-text reproduction, screenshots, full video
reposts — content that lets readers avoid visiting the source. Vietnam's
IP Law still recognizes "trích dẫn hợp lý" (reasonable citation) as an
exception.

**How VNin1's current design compares:** structurally aligned with the
lower-risk "link-out aggregator" pattern — title links to the original
URL (not to VNin1), every card credits the source, no full article text
is ever fetched/stored. This is a meaningfully different shape from what
the regulation targets.

**Genuine gray area, not resolved by research:** the RSS-provided excerpt
(~160 chars) is still verbatim source text, not VNin1's own words. Whether
a publisher publishing an RSS feed counts as "consent" to reproduce even
a short excerpt is genuinely unclear from available sources — this is the
main reason the per-article AI summarizer (replacing excerpt with
AI-paraphrased text) was reprioritized higher, see "Up next" item 1 above.

**Commercial use raises stakes:** several sources distinguish "chia sẻ để
lan tỏa" (sharing to spread information) from "khai thác nhằm mục đích
thu lợi" (exploiting for profit) — the latter is treated more seriously.
Site currently has no ads/monetization. If that ever changes, get real
legal counsel first — this note is not a substitute for that.

---

## NEXT SESSION — resume here

Nothing broken, nothing mid-push. Just pick the next Content Rules build
plan item and go. See `CONTENT_RULES.md` → "Build plan" for full detail;
summary below.

### Done and verified live (no action needed)
1. ~~Dedup across themes~~ (Rule 1)
2. ~~Cross-source content-similarity dedup~~ (Rule 1b) — piggybacks on the
   scorer's Groq call, catches same-event stories from different outlets
3. ~~Blocklist expansion~~ (Rule 4)
4. ~~Theme-summary prompt revision~~ (Rule 3, what/why/impact)
5. ~~Training scorer activated~~ (Rule 5, parts 1-2) — 16 liked / 14
   disliked examples in `training.json`
6. ~~Source list refreshed~~ — added Vietstock, CafeBiz, MarketWatch, WSJ;
   removed Thanh Niên (kept surfacing as unwanted duplicate). Current:
   **10 sources total** — see "Content — feeds and themes" section below
   for the exact per-theme breakdown.
7. ~~Groq rate-limit hardening~~ — configurable token limits per call,
   `SCORE_BATCH_LIMIT = 20` cap, 2-second gap between per-theme Groq calls.
   See "AI features" section below for detail.

### Up next, in order
1. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   moderate scope, adds ~32 Groq calls/fetch (well within free-tier quota).
   Replaces the raw RSS excerpt currently shown on cards with a real
   AI-condensed 30-40 word summary per article. **Priority raised
   2026-07-21** — beyond the original editorial reason (Rule 3), this also
   reduces legal exposure under Nghị định 174/2026/NĐ-CP (see "Legal note"
   below): the current card excerpt is verbatim RSS text from the source,
   not transformative content. Note: `index.astro` currently falls back to
   raw `excerpt` if `condensed` is missing for an article — worth deciding
   at build time whether to keep that fallback or show nothing instead,
   since the fallback re-introduces the exact risk this feature is meant
   to reduce.
2. **Top bar upgrade + market data sourcing** — see "Open items" section
   below for full detail (VNIndex/VN30/%, TCBS/FireAnt candidates
   researched but not yet tested in code).
3. **Admin voting buttons (Like/Dislike/Block) on live site** — new
   feature, fully speced, not started. This is a real architecture change
   (adds a serverless API to an otherwise fully static site) — budget a
   full focused session, not a quick add.

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
4. **Recency vs. sharpness trade-off** — user asked about reducing
   article staleness on the live site (some articles showing 9h old while
   fresher ones exist). Root cause identified: `scoreAndFilter()`'s
   relevance score outweighs its small recency bonus, by design (Rule 5).
   User explicitly chose **Option C: leave as-is** — sharp analysis over
   freshness is intentional, not a bug. Revisit only if it starts feeling
   wrong in practice; the fix would be increasing the recency bonus weight
   in that function, or adding a hard "always keep newest N" floor per theme.

### Ongoing, no fixed schedule
**`EXAMPLES.md`** — user adds liked/disliked/block-candidate headlines
whenever spotted on the live site. Bring the file (or new lines) to a
session whenever ready to "cash it in" — gets sorted into `training.json`
or `CONTENT_BLOCKLIST` as appropriate. Not urgent, no deadline. Once the
admin voting buttons above are built, most Liked/Disliked/Block additions
will come from button clicks instead of manual typing — but the file and
workflow itself don't change, just the input method.

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

**Current sources (10 total, 4 themes):**
- Chứng khoán: CafeF, VnEconomy, VnExpress, Vietstock, CafeBiz
- Bất động sản: CafeF, VnEconomy, VnExpress, CafeBiz
- Vĩ mô / Đầu tư: CafeF, VnEconomy, VnExpress, CafeBiz
- International: CNBC, Financial Times, SCMP, Vietstock, MarketWatch, WSJ

(Thanh Niên was removed 2026-07-21 — kept surfacing as an unwanted
duplicate across themes since its RSS feed was too generic to distinguish
which theme a story actually belonged to.)

**Two dedup layers active** (see Rules 1 and 1b in `CONTENT_RULES.md`):
exact-link dedup (same feed reused across themes) and cross-source
content-similarity dedup (different outlets covering the same event).

**Content editorial rules:** see `CONTENT_RULES.md` — source of truth for
what/how content gets collected and summarized. See also `EXAMPLES.md` — the
running scratchpad of real liked/disliked/block-candidate headlines that
feeds into `CONTENT_RULES.md`'s rules over time.

---

## AI features (Groq)

Two Groq-powered features exist in `fetch-feeds.mjs` (a third is planned,
see Content Rules build plan):

1. **Theme summaries** (`generateSummary`) — ✅ **active, verified live.**
   2-3 sentence Vietnamese wire-style summary per theme (what → why/how →
   impact/consequence), shown at the top of each section, labeled
   "AI Summary". Revised 2026-07-21 to explicitly add the impact component.
2. **Training scorer + cross-source dedup** (`scoreAndFilter`) — ✅
   **active, verified live.** Scores articles against 16 liked / 14
   disliked examples in `src/data/training.json`, filters + re-ranks by
   relevance + recency, and (as of 2026-07-21) also flags same-event
   duplicates across sources in the same call. Confirmed running on real
   hourly fetches (Actions log shows `Training filter: X/Y kept` and
   `Cross-source dedup: N similar-content duplicate(s) dropped` per theme).
   Deliberately weighs sharp analysis over freshness — see "Up next" item 5
   in NEXT SESSION above.

   **Rate-limit hardening (2026-07-21):** `groqCall()`'s `max_tokens` is now
   configurable per call (scorer requests 1500, summaries stay at the 300
   default) — fixes JSON-truncation errors that started appearing once
   themes with many sources produced 25-30 articles per scoring call.
   `SCORE_BATCH_LIMIT = 20` caps how many articles get sent to Groq for
   scoring per theme (oldest overflow held back as a fallback pool only).
   A 2-second gap between each theme's Groq call avoids bunching all 4
   scorer calls into the same 60-second TPM window. Free tier for
   `llama-3.3-70b-versatile` is tighter than the model comment below used
   to suggest — roughly 30 RPM / 6,000 TPM / 1,000 RPD, not the
   14,400 RPD figure (that number is for a different, smaller model).

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
- **New session (2026-07-21):** added Vietstock, CafeBiz, MarketWatch, WSJ
  (7 → 11 sources), then removed Thanh Niên (11 → 10) after it kept
  surfacing as an unwanted duplicate across themes. Fetch-tested all 4
  additions in production via real Actions runs, not just locally.
- **New session:** built and verified Rule 1b (cross-source
  content-similarity dedup) — piggybacks on the existing scorer Groq call,
  confirmed catching real duplicates (the reported CafeF/VnEconomy metro
  story case, plus others) via Actions log across multiple runs.
- **New session:** diagnosed and fixed a real bug the dedup feature
  exposed — `Training scorer failed: Unexpected end of JSON input` on
  high-article-count themes, caused by the old 300-token output cap
  truncating the longer JSON response. Fixed with configurable
  `groqCall()` token limits, `SCORE_BATCH_LIMIT = 20`, and a 2-second gap
  between per-theme Groq calls. Verified clean across 2 consecutive runs
  with no truncation errors, including on the highest-article-count theme.
- **New session:** revised the theme-summary AI prompt to explicitly add
  the impact/consequence component (Rule 3, theme-level) — verified live,
  summaries now read what → why/how → impact when headlines support it.
- **New session:** researched VN-Index/HNX/VN30 replacement sources
  (TCBS, FireAnt) — both confirmed live/legitimate but exact JSON
  endpoints not yet verified by direct testing; queued as a bundled
  top-bar task for a future session (see "Open items" above).
- **New session (2026-07-21):** researched Nghị định 174/2026/NĐ-CP
  (Vietnamese press-copyright regulation, effective 1/7/2026) at user's
  request — see "Legal note" section above. Reprioritized per-article AI
  summarizer higher (reduces legal exposure, not just editorial benefit).
  Dropped bank/securities 30% quota (Rule 5 part 3) from the plan —
  decided not worth the complexity.
