# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

**How to resume:** say "let's resume" and share this file. Start at the
"NEXT SESSION — resume here" section below — it's kept current after every
session.

---

## STATUS (as of this session)

**Site is live at vnin1.vercel.app.** All infra bugs from the previous
session (GROQ_API_KEY wiring, hardcoded footer, VnExpress/Thanh Niên HTML
entity garbling) are fixed, verified live, and stable. This session focused
on content-quality rules — see `CONTENT_RULES.md` (new file, in repo root)
for the full editorial rule set.

**Mid-task right now:** the first content fix (cross-theme dedup) is
**written and committed locally, but NOT yet pushed to GitHub** — a git sync
issue interrupted the push. See "NEXT SESSION" step 1 below — this is a
git-recovery task, not a code problem. The code itself is done and correct.

---

## NEXT SESSION — resume here

### Step 1 — finish the interrupted push (git recovery, do this first)

What happened: local `src/data/feed.json` had uncommitted changes, which
blocked `deploy.bat`'s pull-before-push safety step. A commit
(`3114e8f`, "04 content rules") was created locally containing the dedup
fix + `CONTENT_RULES.md`, but the push was rejected as non-fast-forward
because local history was behind GitHub's.

**Nothing is lost — the commit is safely sitting in the local repo.** Run
these commands in order, from `Astro page` folder:

```
git checkout -- src/data/feed.json
git pull origin main
```

Watch the output:
- Clean merge / fast-forward → continue
- Vim editor opens for a merge message → type `:wq` and press Enter. If
  that doesn't respond, close the terminal window entirely and run
  `git commit --no-edit` in a fresh terminal instead.
- Any `CONFLICT` message → stop, do not guess, paste the exact text for
  diagnosis before running anything else.

Once merged cleanly:
```
git push
```

Confirm with `git status` — should read "up to date with origin/main",
clean tree.

### Step 2 — verify the dedup fix actually works

1. GitHub → **Actions** tab → **"Update news feed"** in sidebar → **Run
   workflow** → confirm
2. Open that run → **refresh** job → **"Fetch latest feeds"** step
3. Look for lines like: `  1 duplicate(s) dropped (already in another section)`
   — this confirms the fix is catching cross-theme duplicates
4. Wait ~1-2 min, check `vnin1.vercel.app` (hard refresh) — scan Chứng khoán,
   Bất động sản, Vĩ mô/Đầu tư for the same headline appearing twice. Should
   no longer happen.

### Step 3 — continue the Content Rules build plan

See `CONTENT_RULES.md` → "Build plan" section for the full ordered list.
After Step 2 confirms dedup works, next up in order:

1. ~~Dedup across themes~~ — done pending push verification (Step 1-2 above)
2. **Blocklist expansion** (Rule 4 — exclude implied promo content, and
   government/Party propaganda / pure diplomatic content) — quick, low-risk
3. **Theme-summary prompt revision** (Rule 3 — add explicit
   what/why/impact structure to the AI summary prompt) — quick prompt edit
4. **Populate `training.json` with first examples** (Rule 5, parts 1-2) —
   blocked on the user supplying real liked/disliked headline examples;
   cannot be built without that input
5. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   not yet started, replaces raw RSS excerpt with a real AI-condensed
   30-40 word summary per card
6. **Bank/securities 30% quota logic** (Rule 5, part 3) — new feature,
   needs sector-tagging before a quota check can run

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

**Content editorial rules:** see `CONTENT_RULES.md` — new file, this
session. Do not duplicate that content here; that file is now the source
of truth for what/how content gets collected and summarized.

---

## AI features (Groq)

Two Groq-powered features exist in `fetch-feeds.mjs` (a third is planned,
see Content Rules build plan step 5):

1. **Theme summaries** (`generateSummary`) — 2-sentence Vietnamese wire-style
   summary per theme, shown at the top of each section, labeled "AI Summary".
   Prompt revision pending (Content Rules build plan step 3).
2. **Training scorer** (`scoreAndFilter`) — scores articles against
   liked/disliked examples in `src/data/training.json`, filters + re-ranks.
   Inactive until that file has entries (0 liked, 0 disliked as of this
   session).

Model: `llama-3.3-70b-versatile`. Endpoint: Groq's OpenAI-compatible chat
completions API. Secret: `GROQ_API_KEY` — confirmed correctly wired into
`update-feed.yml`'s `env:` block, working in production.

**Note:** an "article condensing" feature was described in very old planning
docs as if it existed — it does not, and never did, in the actual code.
This is now correctly tracked as an unbuilt feature under Content Rules
build plan step 5, not a "broken" feature to debug.

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

1. **VN-Index / HNX-Index** — VNDirect finfo API still failing (`fetch failed`)
2. **Gold VND** — both candidate sources still failing (giavang.org 404,
   api.btmc.vn fetch failed)
3. **README.md rewrite** — still describes an older/different state than
   reality in places; `PLANNING.md` (this file) is the accurate one

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
- **This session:** cross-theme dedup logic written (Rule 1) — committed
  locally (`3114e8f`), **push interrupted, not yet on GitHub** — first
  thing to finish next session
