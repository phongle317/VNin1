# Content Rules — VNin1

The single source of truth for editorial judgment: what gets collected, how
it's summarized, and why. Read this before changing anything in
`fetch-feeds.mjs` related to filtering, scoring, or AI prompts.

This file is the **intent**. It gets implemented across three places in code:
- `CONTENT_BLOCKLIST` / `INTL_BLOCKLIST` in `fetch-feeds.mjs` — hard, absolute exclusions
- `src/data/training.json` — liked/disliked examples the AI scorer learns from
- AI prompts inside `generateSummary()` (and a not-yet-built per-article
  summarizer) — governs tone/length/structure of generated text

Rules are numbered and dated so we can track what changed and why.

---

## Audience

- **80%** — business owners, investors
- **20%** — students of economics and investment

Every judgment call (what's "interesting," what's "sharp") should be made
through this lens, not general-interest news judgment.

---

## RULE 1 — No duplicate stories across sections
*Added: 2026-07-18*

The same event/speech must appear in exactly one theme section, never two.

**Current problem:** several source feeds are reused verbatim across multiple
themes (e.g. Thanh Niên's `kinh-te.rss` feeds into Chứng khoán, Bất động sản,
*and* Vĩ mô/Đầu tư; VnExpress's `kinh-doanh.rss` feeds into two themes too).
Since it's the same feed, the same article shows up in multiple sections.

**Status:** ✅ **Done — verified live.** A shared `seenLinks` Set is passed
across all themes in `fetch-feeds.mjs`'s `main()`/`fetchTheme()`; first
theme to see a link keeps it, later themes drop the duplicate. Confirmed via
GitHub Actions log (`5-16` duplicates caught per run across two separate
test runs) and confirmed visually on the live site — no headline repeats
across Chứng khoán / Bất động sản / Vĩ mô-Đầu tư.

---

## RULE 2 — Headlines are never rewritten
*Added: 2026-07-18*

Headline text must always be the exact original headline from the source
outlet — no AI paraphrasing, no editorializing.

**Status:** already true in current code. `title` comes straight from the
RSS feed's `<title>` field, only HTML-decoded, never passed through AI.
Locking this here so it isn't "improved" into AI-rewritten headlines later.

---

## RULE 3 — Summary quality standard
*Added: 2026-07-18*

Applies to both the per-theme AI Summary box and (once built) per-article
summaries:

1. **Not a copy of the article** — a sharp reading of it, not a restatement.
   Should answer, in order: **what is happening → why/how → impact/consequence.**
2. **Length:** ~30 words typical. Up to 40 is fine. 10–20 words is
   acceptable but not preferred — too short usually means missing the
   why/impact parts. Never copy-paste source text.
3. **Language:** always concise, efficient. No filler phrases
   ("các tiêu đề cho thấy", "đáng chú ý", "thị trường đang").

**Status:**
- Theme-level AI Summary: prompt exists, needs revision to explicitly add
  the "impact/consequence" third component (currently only does what+why).
- Per-article summary: **does not exist yet.** Cards currently show the raw
  RSS excerpt (copied text from the source), which violates 3(1). Needs to
  be built as a new AI call per article.

---

## RULE 4 — Hard exclusions
*Added: 2026-07-18*

Never collect:
1. **Business promotion / PR / advertising** — including implied/soft
   promotion (e.g. a "news" article that's really a company product
   showcase dressed as journalism)
2. **Government/Party propaganda-flavored content**, and **pure
   international-relations/diplomatic** articles with no direct business/
   investment angle

**Status:** ✅ **Done — verified live.** `CONTENT_BLOCKLIST` expanded with 16
phrases covering corporate PR/soft-promotion framing (`mở rộng đầu tư`,
`khai trương`, `đồng hành cùng việt nam`, `siêu đô thị`, etc.) and
government rhetoric (`quyết liệt thực hiện mục tiêu`, `từ cam kết sang kết
quả`). Every phrase was tested against real examples before shipping: 16/16
known-bad headlines caught, 0/10 false positives against known-good
headlines. Confirmed live via Actions log — content filter actively
dropping articles on real hourly runs (e.g. `3 articles dropped by content
filter`, `1 articles dropped by content filter`).

"Implied" promotion that isn't keyword-detectable (soft pitches, vague
expert-quote fluff dressed as analysis) is handled via `training.json`
disliked examples instead — see Rule 5.

---

## RULE 5 — Prioritization
*Added: 2026-07-18*

Actively prefer, when ranking/selecting articles:
1. **Sharp arguments, solid data, real analysis** — over vague/soft reporting
2. **Audience fit:** 80% business-owner/investor relevance, 20% economics/
   investment-student relevance (see Audience section above)
3. **Sector quota:** articles about **banks and securities companies** should
   make up **at least 30%** of what's collected, by area

**Status:**
- ✅ **(1) and (2) done — verified live.** `training.json` now holds 16
  liked + 14 disliked real examples; `scoreAndFilter()` is active and
  confirmed running on real hourly fetches (e.g. `Training filter: 8/20
  kept`, `6/11 kept` per theme in Actions logs).
- **Known trade-off, deliberately kept as-is:** the scorer weighs relevance
  (sharp analysis, audience fit) more heavily than freshness — a small
  recency bonus (`+2` under 6h, `+1` under 24h) isn't enough to beat a
  strong relevance score. In practice this means some displayed articles
  are several hours old even when fresher, thinner articles exist. This was
  explicitly reviewed and kept (Option C) on 2026-07-18 — Rule 5(1)
  "prioritize sharp analysis" was written to mean exactly this. Revisit if
  it starts feeling too stale; the fix would be increasing the recency
  bonus weight or adding a hard "always keep the newest N" floor.
- ⏳ **(3) not yet implemented** — needs new logic: after scoring/filtering,
  check bank/securities-tagged article share and backfill from that
  category if under 30%.

---

## Build plan (ordered)

1. ~~Dedup across themes~~ (Rule 1) — ✅ done, verified live
2. ~~Blocklist expansion~~ (Rule 4) — ✅ done, verified live
3. **Theme-summary prompt revision** (Rule 3, what/why/impact) — quick prompt edit, next up
4. ~~Populate `training.json` with first examples~~ (Rule 5, parts 1–2) —
   ✅ done, verified live (16 liked / 14 disliked)
5. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   moderate scope, adds ~32 Groq calls/fetch (well within free-tier quota)
6. **Bank/securities 30% quota logic** (Rule 5, part 3) — new feature,
   needs a sector-tagging step before the quota check can run

---

## Training examples status

`src/data/training.json` — **16 liked, 14 disliked.** Active and confirmed
running on real hourly fetches. More examples always welcome — drop them in
`EXAMPLES.md` as you spot them on the live site, batch them up whenever
convenient, and I'll fold them in.

---

## Change log

- 2026-07-18 — Rules 1–5 established (first version of this file)
- 2026-07-18 — Rule 1 (dedup) implemented in code, committed locally as
  `3114e8f`, push interrupted by a git sync issue
- 2026-07-18 — push completed (`4f20782`), Rule 1 fix now on GitHub,
  live verification pending
- 2026-07-18 — Rule 1 verified live: GitHub Actions log confirmed
  duplicates being caught (5-16 per run across two test runs), live site
  confirmed no repeated headlines across sections. Rule 1 closed.
- 2026-07-18 — Rule 4 (blocklist expansion) implemented from real examples
  in `EXAMPLES.md`, tested (16/16 caught, 0/10 false positives), pushed,
  verified live via Actions log. Rule 4 closed.
- 2026-07-18 — Rule 5 parts 1-2 (training scorer) activated with first
  16 liked / 14 disliked examples from `EXAMPLES.md`, pushed, verified
  live via Actions log (`Training filter: X/Y kept` per theme). Sharp-
  analysis-over-freshness trade-off reviewed and deliberately kept as-is.
  Part 3 (30% bank/securities quota) remains open.
