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

**Status:** not yet fixed — needs a dedup step in `fetch-feeds.mjs` that
checks article links across *all* themes in a single fetch run and keeps
each story in only one place (see Build Plan below).

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

**Status:** partially covered.
- `CONTENT_BLOCKLIST` already excludes some promo language (`khuyến mãi`,
  `tri ân khách hàng`, `ưu đãi khách hàng`) and some propaganda-flavored
  anniversary content (`chào mừng kỷ niệm`, `toàn dân`).
- Not yet covered: "implied" promotion (soft PR dressed as news — hard to
  keyword-match, better handled via training examples), and pure diplomatic/
  international-relations content has no blocklist entries yet.

---

## RULE 5 — Prioritization
*Added: 2026-07-18*

Actively prefer, when ranking/selecting articles:
1. **Sharp arguments, solid data, real analysis** — over vague/soft reporting
2. **Audience fit:** 80% business-owner/investor relevance, 20% economics/
   investment-student relevance (see Audience section above)
3. **Sector quota:** articles about **banks and securities companies** should
   make up **at least 30%** of what's collected, by area

**Status:** not yet implemented.
- (1) and (2) are naturally suited to the training scorer
  (`scoreAndFilter()` in `fetch-feeds.mjs`), which already exists in code
  but is inactive because `training.json` has no examples yet.
- (3) is a new kind of rule — a *quota*, not a preference. Needs new logic:
  after scoring/filtering, check bank/securities-tagged article share and
  backfill from that category if under 30%.

---

## Build plan (ordered, not yet started)

1. **Dedup across themes** (Rule 1) — clear bug, isolated fix, do first
2. **Blocklist expansion** (Rule 4) — quick, low-risk, do alongside #1
3. **Theme-summary prompt revision** (Rule 3, what/why/impact) — quick prompt edit
4. **Populate `training.json` with first examples** (Rule 5, parts 1–2) —
   requires you to supply liked/disliked headline examples; I can't invent
   your editorial taste, only encode it once you provide samples
5. **Build per-article AI summarizer** (Rule 3, per-article) — new feature,
   moderate scope, adds ~32 Groq calls/fetch (well within free-tier quota)
6. **Bank/securities 30% quota logic** (Rule 5, part 3) — new feature,
   needs a sector-tagging step before the quota check can run

---

## Training examples status

`src/data/training.json` — **0 liked, 0 disliked.** Inactive until populated.
To add examples: paste headlines you'd want more/less of, and I'll format
them into the file.

---

## Change log

- 2026-07-18 — Rules 1–5 established (first version of this file)
