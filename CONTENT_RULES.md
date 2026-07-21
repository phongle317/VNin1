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

## RULE 1b — No duplicate stories across sources (same event, different link)
*Added: 2026-07-21*

Different from Rule 1: two different sources (e.g. CafeF and VnEconomy)
covering the same real-world event with different wording and different
links — likely both rewriting the same press release. Exact-link dedup
(Rule 1) can't catch this since the URLs are genuinely different.

**Status:** ✅ **Done — verified live.** Piggybacks on the same Groq call
already made in `scoreAndFilter()` for relevance scoring — the prompt now
also asks Groq to flag which headlines within the batch describe the same
underlying event; within each flagged group, the highest-scoring article
is kept and the rest dropped. No extra API calls needed. Confirmed via
Actions log (`Cross-source dedup: N similar-content duplicate(s) dropped`,
seen catching 1-5 duplicates per run across multiple real test runs) and
confirmed visually on the live site — the specific case reported (CafeF +
VnEconomy both covering "Bất động sản liền kề metro...") no longer repeats.

**Related fix, same session:** this feature initially caused
`Training scorer failed: Unexpected end of JSON input` on themes with many
articles (25-30, after 11 sources were added) — the longer JSON response
(scores + duplicate groups) was hitting the old 300-token output cap.
Fixed by making `groqCall()`'s token limit configurable per call (scorer
now requests 1500) and adding `SCORE_BATCH_LIMIT = 20` to cap how many
articles get sent to Groq per theme (oldest overflow articles are excluded
from scoring, only used as a fallback if too few scored articles survive
filtering). Also added a 2-second gap between each theme's Groq calls to
avoid bunching into the same 60-second TPM window.

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
- ✅ **Theme-level AI Summary: done, verified live.** Prompt revised to
  explicitly request 2-3 sentences (what → why/how → impact/consequence),
  with the third sentence only included when headlines actually support a
  clear consequence (explicit instruction against inventing one). Confirmed
  on live site — summaries now read with a clear causal chain, not just
  what+why.
- ⏳ **Per-article summary: still does not exist.** Cards currently show the
  raw RSS excerpt (copied text from the source), which violates 3(1). Needs
  to be built as a new AI call per article — next up on the build plan.

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

*(Part 3, a hard 30% bank/securities sector quota, was considered but
**removed from the plan on 2026-07-21** — decided not worth the added
complexity of building a sector-tagging step. Audience fit via the
training scorer already tends to surface bank/securities content when
it's genuinely sharp; a hard quota risked forcing in weaker articles just
to hit a number.)*

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

---

## Build plan (ordered)

1. ~~Dedup across themes~~ (Rule 1) — ✅ done, verified live
2. ~~Cross-source content-similarity dedup~~ (Rule 1b) — ✅ done, verified live
3. ~~Blocklist expansion~~ (Rule 4) — ✅ done, verified live
4. ~~Theme-summary prompt revision~~ (Rule 3, what/why/impact) — ✅ done, verified live
5. ~~Populate `training.json` with first examples~~ (Rule 5, parts 1–2) —
   ✅ done, verified live (16 liked / 14 disliked)
6. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   moderate scope, adds ~32 Groq calls/fetch (well within free-tier quota).
   Next up on the build plan — priority raised 2026-07-21, also reduces
   legal exposure under Nghị định 174/2026/NĐ-CP (see `PLANNING.md` →
   "Legal note" for detail).

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
- 2026-07-21 — Added Vietstock, CafeBiz, MarketWatch, WSJ (7 → 11 sources),
  removed Thanh Niên (11 → 10 sources) after it kept surfacing as an
  unwanted duplicate source across themes.
- 2026-07-21 — Rule 1b (cross-source content-similarity dedup) built,
  tested against the real reported case (CafeF + VnEconomy both covering
  the same metro/real-estate story), pushed, verified live via Actions log
  (`Cross-source dedup: N similar-content duplicate(s) dropped`). Required
  a follow-up fix same session: the longer JSON response was hitting the
  old 300-token cap on high-article-count themes — fixed via configurable
  `groqCall()` token limits (1500 for the scorer) + `SCORE_BATCH_LIMIT = 20`
  + a 2-second gap between per-theme Groq calls to avoid TPM bursts. Rule
  1b closed.
- 2026-07-21 — Rule 3 theme-level summary prompt revised to explicitly
  request what → why/how → impact/consequence (was previously only
  what+why), with an explicit instruction not to invent an impact when
  headlines don't support one. Verified live — summaries read with a clear
  causal chain. Rule 3 theme-level closed; per-article half remains open,
  priority raised (see `PLANNING.md` → "Legal note").
- 2026-07-21 — Rule 5 part 3 (30% bank/securities quota) dropped from the
  plan — decided not worth the sector-tagging complexity it would need.
