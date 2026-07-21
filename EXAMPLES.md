# Content Examples — VNin1

A running scratchpad — not polished, just a place to drop real examples as
you spot them while browsing the live site. No fixed format required, just
enough detail that the pattern is clear later.

**How to use this file:**
1. See something good, bad, or block-worthy on `vnin1.vercel.app` → add one
   line here, right away, 10 seconds, don't overthink it
2. Whenever you're ready to "cash it in," paste this file (or just the new
   lines) into a chat — the examples get sorted into the right place:
   - **Block candidates** → `CONTENT_BLOCKLIST` / `INTL_BLOCKLIST` in
     `fetch-feeds.mjs` (hard, automatic exclusion, no AI judgment)
   - **Liked / Disliked** → `src/data/training.json` (a taste signal the AI
     scorer weighs, not an absolute rule)
3. Once actually coded and pushed, entries take effect on every future
   hourly fetch automatically — no further action needed after that

You can delete lines from this file once they've been turned into real code,
or just leave them here as a historical record — your call.

---

## General principles (quick reference — full detail in `CONTENT_RULES.md`)

**Audience:** 80% business owners/investors, 20% economics/investment
students. Judge every example through this lens, not general-interest
news judgment.

**What makes something "liked":**
- Sharp argument, solid data, real analysis — not vague/soft reporting
- Directly useful to someone running a business or managing investments
- Specific: numbers, company names, concrete mechanisms — not generalities

**What makes something "disliked":**
- On-topic but soft, generic, or filler — technically finance/business
  news but nothing sharp or actionable in it
- Reads like a listicle or "tips" piece rather than analysis

**What makes something a "block candidate" (hard exclusion, not just
disliked):**
- Promotion/PR/advertising — including *implied* promotion (a "news"
  article that's really a company product showcase in disguise)
- Government/Party propaganda-flavored content
- Pure diplomatic/international-relations content with no direct
  business/investment angle

**Headlines are never judged on rewriting** — they're always the exact
original from the source, that's a separate locked rule (Rule 2), not
something examples here should touch.

**Summaries aren't judged here either** — summary quality (what/why/impact,
~30 words, no filler) is a prompt-engineering concern (Rule 3), not an
article-selection one. Examples in this file are about *which articles*
get collected, not how they get summarized.

---

## Block candidates (Rule 4 — hard exclusions)

*Promo/PR/advertising (implied or direct), government/Party propaganda,
pure diplomatic/international-relations content with no business angle.*

- Marina Living: Dấu ấn trách nhiệm xã hội của BIM Land trong phân khúc nhà ở xã hội

---

## Liked (Rule 5 — want more like this)

*Sharp arguments, solid data/analysis, relevant to business owners/investors
(80%) or economics/investment students (20%).*

- (add examples here)

---

## Disliked (Rule 5 — want less like this)

*Vague, soft, filler content — technically on-topic but not sharp or
useful to the target audience.*

- (add examples here)

---

## Unsure / needs discussion

*Anything you're not sure which bucket it belongs in — flag it here and
we'll sort it out together.*

- (add examples here)
