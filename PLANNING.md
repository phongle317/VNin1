# Project Planning — Master Decision Log

Drop this file in the repo root alongside `README.md`. It is the single source
of truth for every product, design, and technical decision. Start every new
session by reading this file top to bottom before touching any code.

**How to resume:** say "let's resume" and share this file. Start at the
"NEXT SESSION — resume here" section below — it's kept current after every
session.

---

## STATUS (as of this session)

**Update 2026-08-01:** user chose to start Phase 5 (admin buttons) ahead
of the planned order, since it has zero dependency on the still-unverified
Groq/Layer-1 work. Phase 5 step 1 (Astro static → hybrid, Vercel adapter
installed) is done and verified live — see Phase 5 in the PLAN section
below for full detail. Separately, researched 3 candidate data sources at
user's request (VIRA, VBMA, ADB AsianBondsOnline) for interest-rate
charts — none usable for automation (VIRA: charts are images only, no
RSS; VBMA: relevant pages require login; ADB: public but JS-rendered,
no clean API found, quarterly not daily data). Logged so nobody re-checks
these without new information — see "Open items" section.

**Site is live and stable for everything EXCEPT AI features right now** —
this has spanned two sessions of debugging, both ending on an unconfirmed
push. **Check the very top of STEP 0 first** — there is a fresh code fix
(Bug #6 below) whose push to GitHub is unconfirmed as of right now.

**Full diagnosis history — read this before touching anything, so the
next 429 doesn't restart the guessing loop:**
1. Session 1: hit 429 repeatedly, assumed daily *request* quota exhausted
   → added rate-limit diagnostics + wider gaps + backoff-on-429 retry
2. Next test run **hung for 10+ minutes** — the retry-backoff had no
   upper cap, and Groq's `retry-after` was apparently huge → fixed with a
   15-second hard cap (`MAX_RETRY_BACKOFF_MS`). **This fix IS confirmed
   pushed**, commit `6b9d082`, verified working (no more hangs).
3. Session 2 (this one): re-ran with the hang-fix in place. Got clean
   429s (no hang), but they kept recurring. Checked Groq's usage
   dashboard: token usage the prior day was 100.5K (high), theorized
   daily *token* quota, not request quota.
4. **Found the diagnostic tooling itself had a real bug:** the header
   labels in `rateLimitInfo()` were wrong — `x-ratelimit-remaining-tokens`
   is **always TPM (per-minute)** per Groq's own docs, never a daily
   figure, and neither header exposes a TPD (tokens-per-day) limit if one
   applies. Fixed the labels and added `-reset-` headers.
5. **Tested a "fixed cooldown" theory** (retry-after counting down to one
   unlock time, ~28-30 min) — a second run's retry-after values jumped
   non-monotonically, disproving it.
6. **Found the real gap:** the code never read Groq's actual JSON error
   body — only synthesized `"HTTP 429"` itself. Groq's real body names
   the exact limit type by name (confirmed via their own docs/examples,
   e.g. `"...on tokens per day (TPD): Limit 200,000..."`). Fixed
   `fetchWithTimeout()` to surface this directly. **This is the fix that
   needs pushing and verifying next** — after this, a 429 (if any) will
   state its cause in plain language from Groq itself, no more inference
   from headers or guessing from usage charts.

**Takeaway for next session:** don't re-diagnose from scratch. Push the
Bug #6 fix, run once, and read the error message verbatim — it now tells
you directly which limit was hit.

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

**Verify this first:** a new diagnostic fix (see "Bug found #5" below) was
written near the end of this session — check `scripts/fetch-feeds.mjs` on
GitHub for the text `parsed?.error?.message` inside `fetchWithTimeout()`.
If it's **not there**, this fix never got pushed — copy it in and push
before doing anything else, since without it we're back to guessing at
429s instead of reading Groq's actual explanation.

(The *previous* hang-fix, `MAX_RETRY_BACKOFF_MS`, **was confirmed pushed**
this session, commit `6b9d082` — that one's done, no need to re-check it.)

**Diagnosis history, in order — read this so the next 429 doesn't restart
the guessing from scratch:**
1. First guess: daily **request-count** quota (~1,000 RPD) exhausted.
   Checked Groq's usage dashboard — only ~150-160 requests that day,
   nowhere near 1,000. Wrong.
2. Second guess: daily **token** quota exhausted — dashboard showed 100.5K
   tokens used that day, which is genuinely high. Plausible, but the
   `rateLimitInfo()` header labels used to test this were **themselves
   wrong** (see #3).
3. **Found and fixed a real labeling bug:** `rateLimitInfo()` called
   `x-ratelimit-remaining-tokens` "tokens left this window" — vague enough
   to misread as daily. Checked Groq's actual docs
   (console.groq.com/docs/rate-limits): this header is **always TPM**
   (tokens per minute), and `x-ratelimit-remaining-requests` is **always
   RPD** (requests per day). Neither exposes a TPD (tokens-per-day) limit
   if one applies — Groq doesn't put that in headers at all. Fixed the
   labels to say RPD/TPM explicitly, and added the `-reset-` headers too
   (precise time-until-reset, more reliable than `retry-after` alone).
4. **Third theory, tested and disproven:** watched `retry-after` across a
   full run, expecting it to count down steadily toward a fixed unlock
   time (a temporary anti-abuse cooldown). It did once, but a **second
   run's `retry-after` values jumped around non-monotonically**
   (1849s → 560s → 1724s → 465s...) — ruling out a single fixed-cooldown
   clock. Whatever's actually happening, it's not that.
5. **Bug found #5 (the actual fix, not yet confirmed pushed — see top of
   this section):** the whole time, the code only ever synthesized its own
   `"HTTP 429"` message — it never read the **actual JSON error body**
   Groq sends back, which (confirmed via Groq's own error examples) names
   the exact limit type by name, e.g. `"...on tokens per day (TPD): Limit
   200,000, Used 199,336, Requested 1,524. Please try again in 6m11.52s."`
   Fixed `fetchWithTimeout()` to read and parse this body, surfacing
   `parsed.error.message` directly as the thrown error's message. **This
   ends the guessing entirely** — the next 429 will state which limit
   (RPD/TPM/TPD/other) by name, taken straight from Groq, not inferred.

**Steps once the Bug #5 fix is confirmed pushed:**
1. Run the workflow once (manual trigger)
2. Read the log. Any 429 now shows Groq's real explanation directly in
   the message — act on exactly what it says (e.g. if it says "tokens per
   day", wait for that specific reset; if "tokens per minute", the
   existing backoff/retry should self-resolve it)
3. If still ambiguous somehow, paste the exact new-format log line here —
   don't re-guess, the message itself is now the source of truth. If it
   genuinely does say a daily limit (RPD or TPD), wait for reset (likely
   0:00 UTC ≈ 7am Vietnam time) and don't run more than one or two test
   fetches back-to-back even after reset — that's what got us here.
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

### PLAN — 3 mục tiêu chính, xếp theo độ khó tăng dần

Thay thế hoàn toàn cấu trúc Layer 1/2/3 cũ (lịch sử debug vẫn giữ nguyên ở
STEP 0 phía trên vì còn giá trị tham khảo, nhưng kế hoạch làm việc từ đây
tổ chức lại theo đúng 3 mục tiêu người dùng xác nhận lại ngày 23/7/2026,
xếp dễ → khó, gom mọi việc "chưa rõ, cần nghiên cứu" vào PHASE 2 để xử lý
1 lần, không rải rác qua nhiều phase như trước.

### PHASE 1 — Sửa code, không cần nghiên cứu gì thêm (dễ nhất, làm trước)

**1a. Xóa hẳn tóm tắt AI theo theme (Mục 1 — phần đầu)**
- Xóa toàn bộ hàm `generateSummary()` trong `fetch-feeds.mjs`
- Xóa bước gọi nó trong `main()` (bước "4. AI summaries")
- Xóa field `aiSummary` khỏi object `output` cuối `main()`
- Xóa khung hiển thị `.ai-summary` trong `index.astro`
- **Lợi ích phụ quan trọng:** giảm ~4 lệnh gọi Groq/lần chạy — trực tiếp
  giảm rủi ro 429 đã cản trở việc verify Layer tóm tắt theo bài suốt
  2 đêm liền.

**1b. Vá lỗ hổng đã xác nhận trong `condenseArticles()` (Mục 1 — phần sau)**
- Đã kiểm tra trực tiếp code: hàm này **chưa có** dặn dò "tiêu đề mập mờ
  (kiểu '1 tỉnh/địa phương') → phải dùng excerpt nêu tên cụ thể" — chỉ
  `generateSummary()` (sắp xóa) có dặn này. Thêm dòng dặn dò tương tự vào
  cả nhánh tiếng Việt lẫn tiếng Anh của `condenseArticles()`'s prompt.
- Giữ nguyên mọi quy tắc đã có: 5 thành phần (what/when/where/why/impact),
  bỏ qua phần thiếu dữ liệu, cấm bịa tuyệt đối, không copy nguyên văn
  headline/excerpt.

**Điều kiện qua Phase 1:** `node --check fetch-feeds.mjs` sạch; đọc lại
2 đoạn prompt xác nhận có dòng dặn "nêu tên cụ thể"; `index.astro` không
còn tham chiếu `aiSummary`/`.ai-summary` nào sót lại.

---

### PHASE 2 — Gom mọi thứ "chưa rõ" vào đây, nghiên cứu 1 lần cho xong

Đây là nơi duy nhất trong kế hoạch cần tra cứu/xác minh trước khi code —
không rải các câu hỏi mở qua nhiều phase như lần trước.

**2a. ✅ ĐÃ XONG (2026-08-01)** — Đọc `astro.config.mjs` thật, xác nhận
đang chạy `output: 'static'` thuần. Đã sửa: cài `@astrojs/vercel@7.8.2`
(phiên bản duy nhất khớp `astro@4.16.19` đang dùng — xác nhận qua
`npm view @astrojs/vercel@7 peerDependencies`, không đoán), đổi
`astro.config.mjs` sang `output: 'hybrid'` + `adapter: vercel()`
(import từ `@astrojs/vercel/serverless`, bắt buộc với bản 7.x). Đã
`deploy.bat`, đã xác nhận site live vẫn hiện tin tức bình thường —
không ảnh hưởng gì tới nội dung hiện có. Mục 3 (nút bấm) giờ hết rào
cản kiến trúc, sẵn sàng viết Serverless Function thật.

**2b. Xác nhận nguồn dữ liệu VNIndex/HNXIndex thay VNDirect** — VNDirect
đã chết từ lâu. TCBS (`apipubaws.tcbs.com.vn`) và FireAnt
(`restv2.fireant.vn`) đã tra là "tồn tại thật, hợp pháp" nhưng **chưa xác
nhận URL JSON chính xác** — cần thử trực tiếp bằng `npm run fetch` thật,
giống cách đã làm với RSS nguồn tin trước đây (thử nhiều URL ứng viên
cùng lúc trong 1 lần code, không thử từng cái một).

**2c. Nghiên cứu nguồn "5 mã tăng/giảm mạnh nhất"** — **hoàn toàn mới**,
chưa từng tra trước đây (khác với việc tra chỉ số VNIndex/VN30). Cần tìm
xem TCBS/FireAnt hoặc nguồn khác có endpoint liệt kê top gainers/losers
hay không — đây là loại dữ liệu khác (danh sách nhiều mã, không phải 1
chỉ số), có thể cần nguồn khác hẳn 2 nguồn trên.

**2d. Xác nhận VN30 lấy được dữ liệu gì, hình dạng ra sao** — chưa có
code, cần thiết kế cấu trúc trả về khớp mẫu đã có (`{ value, change,
changePercent }` giống `vnIndex`/`hnxIndex`) trước khi viết code thật ở
Phase 4.

**Điều kiện qua Phase 2:** cả 4 câu hỏi trên có câu trả lời cụ thể, dựa
trên thử nghiệm/tra cứu thật — không phải "chắc là...". Nếu 1 mục vẫn mơ
hồ sau khi tra, ghi rõ vào đây lý do và phương án dự phòng, không để
trống chờ "tính sau" như trước.

---

### PHASE 3 — Xác nhận tóm tắt theo bài chạy được thật (Mục 1, phần verify)

Chạy workflow 1 lần, dựa trên code đã nhẹ hơn từ Phase 1 (bớt 4 lệnh
Groq/lần). Nếu vẫn 429, log giờ đã có công cụ chẩn đoán chính xác (đọc
thẳng thông báo lỗi thật từ Groq, xây dựng đêm 23/7) — không cần đoán lại
từ đầu.

**Điều kiện qua Phase 3(tiêu chí PASS/FAIL, không đổi so với trước):**
- PASS: không `HTTP 429` nào; `Condensed "X": N/8` với N > 0 ở cả 4 theme
  (một số bài để trống là bình thường — AI từ chối đoán bừa là đúng thiết
  kế); site live hiện tóm tắt AI, không còn thấy khung "AI Summary" theme
  nữa (đã xóa ở Phase 1)
- Spot-check bằng mắt: mở 2-3 card, xác nhận không phải danh sách đánh
  số, không có chi tiết bịa, và **nếu tiêu đề gốc mập mờ kiểu "1 tỉnh",
  tóm tắt phải nêu tên tỉnh cụ thể** (đúng yêu cầu mới nhất)

---

### PHASE 4 — Top bar: VNIndex, VN30, %, khối lượng, top gainers/losers (Mục 2)

Thuần HTTP, không đụng Groq — dùng kết quả nghiên cứu từ Phase 2b/2c/2d.
1. Viết code fetch theo URL đã xác nhận ở Phase 2
2. Thiết kế `VN30` theo đúng hình dạng đã chốt ở Phase 2d
3. Thêm top gainers/losers (5 mã mỗi loại) theo nguồn đã tìm ở Phase 2c
4. Cập nhật `index.astro` — bỏ dòng "Thị trường đóng cửa..." (luôn hiện
   dữ liệu mới nhất, không kèm ghi chú trạng thái), thêm khối top bar mới
5. Quyết định hiển thị khi chỉ có 1 phần dữ liệu (VNIndex có, VN30 không):
   hiện phần có, ẩn phần thiếu, không báo lỗi trên UI

**Điều kiện qua Phase 4:** site live hiện đủ VNIndex + VN30 + % + khối
lượng + 5 mã tăng/giảm mạnh nhất, số liệu thật không trống.

---

### PHASE 5 — Nút Like/Dislike/Block, khóa `?key=mothaiba` (Mục 3, khó nhất)

Hạ tầng mới hoàn toàn — Serverless Function đầu tiên của dự án. Bắt đầu
trước lịch gốc (2026-08-01) theo yêu cầu người dùng, không đợi Phase 3/4.

1. ✅ **ĐÃ XONG (2026-08-01):** Astro đã đổi từ `static` sang `hybrid`,
   cài `@astrojs/vercel@7.8.2`, đã test-deploy riêng, xác nhận site vẫn
   build/chạy bình thường — không viết code nút bấm gì ở bước này, đúng
   kỷ luật cũ. Việc còn lại bên dưới có thể bắt đầu ngay.
2. **[TIẾP THEO]** Tạo Vercel Serverless Function — đọc `EXAMPLES.md` từ
   GitHub, kiểm tra trùng lặp, ghi dòng `- <tiêu đề>` vào đúng mục
   (Block/Liked/Disliked), commit thẳng lên GitHub. Dùng GitHub Contents
   API kiểu SHA-conditional (tránh xung đột nếu trùng lúc bot hourly đang
   commit). Đề xuất: xây + test 1 nút trước (ví dụ Block), xác nhận chạy
   đúng đầu-cuối, rồi mới nhân ra đủ 3 nút — cùng tinh thần "test từng
   bước nhỏ trước khi làm tiếp" đã dùng suốt dự án.
3. Token GitHub: tạo fine-grained PAT, chỉ scope đúng 1 repo này,
   quyền `contents:write` — không dùng token rộng
4. Frontend: 3 nút mỗi card trong `index.astro`, loại trừ lẫn nhau, khóa
   sau khi bấm, phản hồi ngắn "✓ Đã ghi nhận"
5. Cổng hiển thị: chỉ hiện nút khi URL có `?key=mothaiba` — giá trị đã
   chốt, không cần hỏi lại

**Điều kiện qua Phase 5:** bấm thử cả 3 nút trên site thật (qua link có
`?key=mothaiba`), xác nhận dòng mới tự động xuất hiện đúng mục trong
`EXAMPLES.md` trên GitHub, không trùng lặp khi bấm lại bài đã chấm.

---

### Việc cũ, không còn nằm trong plan chính — vẫn giữ để tham khảo
**Recency vs. sharpness trade-off** — Option C (giữ nguyên, ưu tiên phân
tích sắc bén hơn độ mới) đã chốt trước đây, không đổi.

**`EXAMPLES.md`** — vẫn là nơi gom ví dụ liked/disliked/block thủ công,
độc lập với 5 Phase trên, không có lịch cố định.

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

1. **Interest-rate/bond data sources — checked 2026-08-01, none usable:**
   - **VIRA** (vira.org.vn) — "Market Watch" charts are pure images (PNG
     screenshots from MSB Research), no extractable data. Homepage
     interbank-rate figure is from a monthly survey report, not daily. No
     RSS feed found.
   - **VBMA** (vbma.org.vn) — has exactly the right-sounding pages
     ("Short-term Benchmark Rate", "Government Bond Yield Fixing") but the
     detail pages redirect straight to `/vi/login` — requires a member
     account, not publicly accessible.
   - **ADB AsianBondsOnline** (asianbondsonline.adb.org) — public, no
     login, but content is JavaScript-rendered (not visible via plain
     fetch); "Data Portal" appears to be manual Excel/CSV download, not a
     clean JSON API; underlying reports (Asia Bond Monitor) are quarterly,
     not daily. Don't re-check without a new, different lead.

2. **Top bar upgrade (VNIndex, VN30, %, khối lượng)** — user requested
   2026-07-21: add VNIndex points, VN30 points, % change, and trading
   volume to the sticky top bar, remove the "Thị trường đóng cửa — hiển thị
   giá đóng cửa gần nhất" explanatory text (always show latest available,
   no status caveat). This is really one bundled task, not separate small
   ones — don't ship the UI half without the data half, since a bar showing
   empty VNIndex/VN30 fields is worse than not having them.

   **Data blocker — VNDirect finfo API still down**, same root cause as
   item 3 below. `fetchMarketIndices()` in `fetch-feeds.mjs` already has
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
   still failing (`fetch failed`). Superseded by item 2 above (top bar
   upgrade) once a replacement source is wired in — this line can be
   deleted then.
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
- **Actually final entry:** the user then tested the fixes from the risk
  review, which surfaced a bug the review itself couldn't have caught (it
  only exists once you actually hit a real rate-limit response) — the
  retry-backoff logic had no upper cap, and a run hung 10+ minutes when
  Groq's `retry-after` header returned a large value. Fixed with
  `MAX_RETRY_BACKOFF_MS = 15000`, skip-retry-if-exceeded logic. **Fix was
  given to the user but push to GitHub was not confirmed before the
  session ended — verify this first thing next time (see STEP 0 top).**
  Separately, checked Groq's real usage dashboard and found today's
  constraint is more precisely a **daily token quota** (100.5K tokens
  used) rather than a daily request-count quota (only ~150-160 requests)
  as first assumed — same practical fix (wait for reset), more accurate
  understanding of why.
