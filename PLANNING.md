# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

**How to resume:** say "let's resume" and share this file. Start at the
"NEXT SESSION — resume here" section below — it's kept current after every
session.

---

## STATUS (as of this session)

**Site is live and stable for everything EXCEPT AI features right now** —
see "NEXT SESSION" below for the one open question blocking full
verification. Today's session covered a lot: refreshed source list (10
sources, added 4 + removed 1), built cross-source content-similarity
dedup (Rule 1b), built the per-article AI summarizer (Rule 3 per-article),
revised both summary prompts to a 5-component structure (what/when/where/
why/impact, strict no-fabrication), and fixed two real bugs found via
live testing (a numbered-list formatting bug, and a rate-limit/429 issue).
**Not everything is confirmed working yet** — the last test run hit
`HTTP 429` on the very first Groq call of the run, before any burst could
even build up, which points to the daily request quota being exhausted
from heavy manual testing tonight rather than a code problem. This needs
one clean verification run once the quota resets — see below.

**End-of-session addition:** before stopping, did a deliberate risk-review
pass across all 3 remaining layers (not just reacting to bugs as they
appear) — added rate-limit header diagnostics to the code itself (so the
next 429, if any, states directly in the log whether it's daily-quota or
this-minute-burst, no more guessing), wrote explicit pass/fail
verification criteria for Layer 1, and pre-identified concrete risks for
Layers 2 and 3 with mitigations already decided — see "NEXT SESSION"
below for all of it.

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

**Layer discipline in effect** (user's framing): Layer 1 (per-article AI
summarizer) → Layer 2 (top bar / market data) → Layer 3 (admin voting
buttons). Don't start a layer until the previous one is confirmed working
via a real Actions run — this has caught 3 real bugs tonight already (see
below), proving the discipline is worth keeping.

### STEP 0 — do this first, before anything else
Last run tonight hit `HTTP 429` (Groq rate limit) on the very FIRST call
of the run — before any burst could build up. This points to the **daily
request quota being exhausted from heavy manual testing tonight** (many
back-to-back `npm run fetch` runs while debugging), not a code bug.

**New tonight, not yet tested but zero-risk (no Groq calls needed to
verify — pure code review is enough):** `fetchWithTimeout()` now attaches
the real HTTP status and response headers to any thrown error, and a new
`rateLimitInfo()` helper reads Groq's `x-ratelimit-remaining-requests`,
`x-ratelimit-remaining-tokens`, and `retry-after` headers when present.
Every Groq-related warning line in the log now appends this automatically,
e.g. `HTTP 429 [requests left today: 0, tokens left this window: 5800,
retry-after: 52000s]`. **This means the very next 429, if any, will state
directly in the log whether it's a daily-quota problem or a
this-minute-burst problem — no more guessing, no more manually checking
console.groq.com.** Read this line first if 429 appears again.

Steps:
1. Run the workflow once (manual trigger)
2. Read the log. If any 429 appears, the message now says exactly why —
   follow what it says (wait for daily reset, or the backoff is already
   handling a burst automatically)
3. If genuinely daily-quota-exhausted: wait for reset (likely 0:00 UTC ≈
   7am Vietnam time), no code changes needed, just re-run once quota's back
4. **Explicit pass/fail criteria for Layer 1** (no ambiguity next time):
   - PASS: no `HTTP 429` anywhere in the log; `Condensed "X": N/8` present
     for all 4 themes where N > 0 (some articles legitimately blank is
     fine — Groq correctly declining to guess is the intended behavior,
     not a bug); all 4 `AI summary for "X"` lines present with actual text
   - FAIL: any `HTTP 429`, any `Condensed "X": 0/8`, or any `Summary for
     "X": <error>` — if FAIL, paste the log, don't proceed to Layer 2
   - Also spot-check the live site once: open 2-3 cards, confirm the
     summary text is NOT a numbered list and doesn't contain any obvious
     invented detail (a date/place/number that doesn't appear in the
     original headline anywhere) — the no-fabrication rule is prompted
     for, but LLMs aren't 100% reliable, so a visual spot-check is cheap
     insurance the log alone can't provide

### Layer 1 — per-article AI summarizer (Rule 3, per-article)
**Status: code complete, NOT yet verified live** — blocked by Step 0 above.

What was built tonight, in order (3 real bugs found and fixed along the
way — this is exactly why layer-by-layer testing matters):
1. `condenseArticles()` function — one Groq call per theme (not one per
   article) covering all final selected articles (≤8/theme, post
   dedup/blocklist/scoring). Language matches the source article (VI
   articles → VI summary, EN → EN). One retry on failure.
2. `index.astro`'s raw-excerpt fallback **removed entirely** — if
   `condensed` is missing, the card shows nothing, never falls back to
   verbatim source text. This was a deliberate decision, not an oversight
   — reduces legal exposure under Nghị định 174/2026/NĐ-CP (see "Legal
   note" above) in addition to the editorial reason (Rule 3(1)).
3. **Bug found #1:** `generateSummary()` (theme-level box) only ever
   received article *titles*, never excerpts — this is why a summary once
   read "một địa phương" instead of naming "Nghệ An" specifically; the AI
   had no access to the specific detail. Fixed by including excerpt in
   the prompt for both `generateSummary()` and `condenseArticles()`.
4. **Rule 3 rewritten** (user's request) to a stricter 5-component
   structure: what → when → where → why → impact, in that priority order,
   *skipping* any component the source doesn't support. Fabrication
   explicitly, repeatedly forbidden in both prompts — "under all
   circumstances, even to make the summary feel more complete."
5. **Bug found #2:** the 5-component instruction, written as a numbered
   list ("1. What happened\n2. When\n3. Where...") in the prompt, caused
   the AI to literally output its summary AS a numbered list instead of
   flowing prose. Fixed by rewriting the instruction as prose guidance and
   adding an explicit "never output a numbered/bulleted list" rule.
6. **Bug found #3:** adding the per-article condensing step roughly
   doubled total Groq calls per run (was ~8, now ~12-16 including
   retries), which combined with heavy manual test-run volume tonight hit
   `HTTP 429`. Hardened: `groqCall()` retry now backs off on 429
   specifically (reads Groq's own `retry-after` header when present,
   falls back to 10s if not — was retrying instantly before, which just
   wastes budget during an active rate-limit window); gaps between
   per-theme calls increased from 2s/1s to 4s/4s/3s across the three
   Groq-calling stages.
7. **Diagnostic tooling added** (see STEP 0) — rate-limit headers now
   surface directly in the log, removing the guesswork that made bug #3
   take multiple round-trips to diagnose tonight.

**Known design asymmetry, intentional — don't "fix" this later without
reason:** `scoreAndFilter()` has no retry on failure (falls back to
unfiltered articles, which still display fine, just unranked).
`condenseArticles()` retries once with backoff. `generateSummary()` has no
retry (falls back to no AI Summary box for that theme). This graduated
approach matches how visible/costly each failure is — a missing rank
order is invisible to a reader, a missing summary box is visible but not
broken-looking, so retry effort is spent where it matters most
(condensing, since a blank card looks more obviously incomplete).

**If Layer 1 still fails after quota resets (i.e. genuinely a burst/TPM
problem, not daily quota):** the rate-limit headers will show `requests
left today` still high but `tokens left this window` at or near 0 — if
so, the next fix is widening gaps further (e.g. 4s→6s) or reducing
`SCORE_BATCH_LIMIT`/condensing batch size further, not re-diagnosing from
scratch.

### Layer 2 — Top bar upgrade + market data sourcing
**Status: research done, no code started.** Blocked behind Layer 1
confirmation per the user's layering rule — though worth noting explicitly:
**this layer makes zero Groq calls** (pure HTTP fetch of market data APIs,
no AI involved), so it has no dependency on Groq quota/rate-limit state at
all. If Layer 1 is still blocked on quota reset timing, this layer could
technically be worked on in parallel without any conflict — mentioning
this in case waiting is inconvenient, but defaulting to strict sequential
order since that's the explicit preference.

**Risks anticipated ahead of time, so next session doesn't rediscover
them one at a time:**
1. **Neither TCBS nor FireAnt has a confirmed exact JSON endpoint yet** —
   both were confirmed "live and legitimate" via search, not via a direct
   test fetch (search tooling couldn't reach that deep). Expect this to
   take several attempts, same as RSS source-hunting did earlier this
   project. **Mitigation already applied in planning:** structure the
   candidate URLs as an array (`candidateUrls: [...]`) per source, same
   pattern as every existing `MARKET_CONFIG` entry — try multiple
   plausible endpoint shapes in one code change rather than one-URL-at-
   a-time round trips.
2. **VN30 has zero existing code** — `fetchMarketIndices()` today only
   handles VNIndex/HNXIndex. This is new parsing logic, not a URL swap.
   Design the return shape to match the existing pattern before coding:
   `{ value, change, changePercent }`, consistent with `vnIndex`/`hnxIndex`.
3. **Trading volume field name is unknown for TCBS/FireAnt** — VNDirect's
   shape used `totalMatchVolume` (comment in code confirms the parsing
   logic already exists for that specific field name, just never reached
   because the fetch itself fails). TCBS/FireAnt will very likely use a
   different field name — don't assume it matches, log the raw response
   shape on first real test to find the actual key name.
4. **Partial-success handling needs a decision before coding, not after:**
   if VNIndex fetch succeeds but VN30 fails (or vice versa), what should
   the top bar show? Recommended default (matches existing `note` field
   pattern): show whichever pieces have data, silently omit the rest —
   no error text in the UI, consistent with how gold/market-indices
   already degrade gracefully today.
5. **This layer removes the "Thị trường đóng cửa..." explanatory text**
   per the user's original request (always show latest available, no
   status caveat) — small UI change, bundle it into the same PR as the
   data work rather than shipping the data half without the UI half (the
   user was explicit: don't ship one without the other).

### Layer 3 — Admin voting buttons (Like/Dislike/Block)
**Status: fully speced, no code started.** Blocked behind Layer 2. This is
a real architecture change (adds a serverless API to an otherwise fully
static site) — budget a full focused session, not a quick add.

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
`deploy.bat` already pulls before every push — that remains sufficient.

**Risks anticipated ahead of time, so next session doesn't rediscover
them one at a time:**
1. **Astro's Vercel deployment mode needs checking BEFORE starting.** This
   site currently ships as pure static output (no server, per README).
   Serverless Functions on Vercel with Astro require the `@astrojs/vercel`
   adapter configured for `server` or `hybrid` output mode — if the
   project is still on pure `static` mode (likely, since no API routes
   exist yet), this is a **prerequisite architecture change**, not just
   "add a function." First step of this layer should be confirming
   `astro.config.mjs`'s current output mode and adapter before writing
   any button/API code — if it needs changing, that's worth its own small
   test-deploy first (confirm the site still builds/deploys correctly in
   hybrid mode) before adding the actual voting feature on top.
2. **GitHub token scope** — when generating the token for this, use a
   **fine-grained PAT scoped to only this one repo, contents:write
   permission only** (not a broad classic token with full repo access).
   Minimizes damage if the Vercel env var ever leaked.
3. **Race condition risk on `EXAMPLES.md` commits** — if the user clicks a
   button at the same moment the hourly feed bot is mid-commit (same
   category of race hit earlier tonight with `feed.json`, see Established
   working rule #6), the serverless function's commit could fail or
   conflict. Mitigation to build in from the start: use GitHub's Contents
   API with SHA-based conditional updates (fetch the file's current SHA
   immediately before writing, include it in the update request) rather
   than a naive read-then-write — GitHub will reject the write with a 409
   if the SHA is stale, which the function should catch and retry once
   (fetch fresh SHA, try again) rather than silently failing or
   overwriting.
4. **This is the only layer with genuinely new infrastructure risk** —
   Layers 1 and 2 both extend existing, proven patterns (more Groq calls,
   more HTTP data sources). Layer 3 is the first serverless function this
   project has ever had. Treat the first version as a spike/prototype
   mentally, not a polished feature — get the core loop working (click →
   commit → visible in GitHub) before worrying about UI polish.

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

### Separately decided, not part of the layer sequence
**Recency vs. sharpness trade-off** — user asked about reducing article
staleness (some articles showing 9h old while fresher ones exist). Root
cause: `scoreAndFilter()`'s relevance score outweighs its small recency
bonus, by design (Rule 5). User explicitly chose **Option C: leave
as-is** — sharp analysis over freshness is intentional, not a bug.
Revisit only if it starts feeling wrong in practice.

### Ongoing, no fixed schedule
**`EXAMPLES.md`** — user adds liked/disliked/block-candidate headlines
whenever spotted on the live site. Bring the file (or new lines) to a
session whenever ready to "cash it in" — gets sorted into `training.json`
or `CONTENT_BLOCKLIST` as appropriate. Not urgent, no deadline. One new
example added tonight: "Marina Living: Dấu ấn trách nhiệm xã hội của BIM
Land..." — filed as a **Block** candidate (corporate brand-launch PR
framing), not Disliked.

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
7. **Heavy manual test-run sessions can exhaust Groq's daily quota**
   (~1,000 requests/day for `llama-3.3-70b-versatile`) — each fetch run
   now costs ~12-16 Groq calls, and debugging sessions with many
   back-to-back manual "Run workflow" triggers can add up faster than
   expected. If `HTTP 429` appears on the very first Groq call of a run
   (no burst possible yet), suspect daily quota exhaustion, not a code
   bug — check console.groq.com → Usage before changing any code. Normal
   automated hourly operation is nowhere near this limit (~16 calls × 24
   runs/day ≈ 384/day); this only bites during intensive same-day testing.

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
- **Same session, later:** user introduced explicit layer discipline
  (Layer 1: per-article summarizer → Layer 2: top bar/market data →
  Layer 3: voting buttons), don't advance a layer until the previous one
  is verified live. Built Layer 1 (`condenseArticles()`), found and fixed
  3 real bugs along the way via this discipline: (1) theme summaries
  reading vague ("một địa phương") because only titles reached the
  prompt, not excerpts — fixed; (2) rewrote Rule 3 to a stricter
  5-component structure (what/when/where/why/impact, skip missing parts,
  fabrication strictly forbidden) per user request, then found the
  numbered-list instruction phrasing was making the AI literally output
  a numbered list instead of prose — fixed; (3) adding the condensing
  step roughly doubled Groq calls/run, hit `HTTP 429` — hardened retry
  backoff and widened gaps between calls, but the very next test run hit
  429 on the FIRST call (before any burst), pointing to daily quota
  exhaustion from heavy manual testing rather than a remaining code bug.
  **Session ended here** — Layer 1 code is complete but not yet confirmed
  working end-to-end; needs one clean verification run once quota resets
  (see "NEXT SESSION" Step 0). Layers 2 and 3 not started, per the
  layering rule.
- **Final addition before stopping (user's request):** rather than end on
  an unresolved bug, did a deliberate forward-looking risk review instead
  of just documenting what already broke. Concrete outputs: (1) code
  change — `fetchWithTimeout()` now attaches HTTP status + response
  headers to thrown errors, and a new `rateLimitInfo()` helper surfaces
  Groq's rate-limit headers (remaining requests today, remaining tokens
  this window, retry-after) directly in every Groq-related log line, so
  the next 429 self-diagnoses instead of requiring a manual console check
  — this is zero-risk (pure logging, no behavior change, verified via
  `node --check` and a mocked-header unit test, no Groq calls consumed);
  (2) explicit written pass/fail criteria for Layer 1 verification, to
  remove ambiguity next session; (3) pre-identified risks + mitigations
  for Layer 2 (unconfirmed endpoints, VN30 has no existing code, unknown
  volume field name, partial-success UI behavior) and Layer 3 (Astro/
  Vercel static-vs-server mode is a likely undiscovered prerequisite,
  GitHub token scope, commit race condition on `EXAMPLES.md`) — written
  down now so next session executes against a plan instead of discovering
  these one at a time mid-build, the same way tonight's bugs were found
  reactively rather than anticipated.
