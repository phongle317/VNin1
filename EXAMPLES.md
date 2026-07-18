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

- Sun Group phát triển siêu đô thị Bình Quới - Thanh Đa gần 99.000 tỷ đồng: Quy mô 424ha, là "mái nhà" của 54.000 người
- Thủ tướng Lê Minh Hưng: Chuyển từ đối thoại sang hành động, từ cam kết sang kết quả cụ thể
- Việt Nam mong doanh nghiệp Hoa Kỳ mở rộng đầu tư vào các lĩnh vực ưu tiên
- Nhật Bản đồng hành cùng Việt Nam phát triển trong kỷ nguyên mới
- Hà Nội quyết liệt thực hiện mục tiêu phát triển nhà ở xã hội
- VIRES: Điều gì sẽ quyết định giá trị bất động sản Vĩnh Long trong chu kỳ phát triển mới?
- Khu công nghiệp xanh trở thành chuẩn cạnh tranh mới để hút FDI chất lượng cao
- Dự án hơn 4.300 tỷ đồng của FPT Quy Nhơn được phép bán cho người nước ngoài
- Tập đoàn C.P. mở rộng đầu tư tại Việt Nam
- Siêu thị Aeon MaxValu đầu tiên khai trương tại TP HCM
- ShopeeFood đầu tư giải pháp mới, tăng cơ hội kinh doanh cho đối tác
- Chính sách của VinCons thu hút nhà thầu phụ
- Chuyên gia: Việt Nam là tâm điểm thương mại AI ở châu Á
- LPBank và Vietnam Post nâng cấp hợp tác, đẩy mạnh chuyển đổi số
- Tập đoàn Rita Võ mở rộng hệ sinh thái đa ngành
- SGI Capital: Cơ hội mua cổ phiếu tốt với giá rẻ đang đến
- 

---

## Liked (Rule 5 — want more like this)

*Sharp arguments, solid data/analysis, relevant to business owners/investors
(80%) or economics/investment students (20%).*

- Chủ tịch Tập đoàn Hoa Lâm đăng ký mua 22 triệu cổ phiếu Vietbank
- Thanh khoản chứng khoán thấp nhất một tháng
- Nhu cầu điện miền Bắc mỗi năm cần thêm 2.000 MW
- VPBank lãi kỷ lục gần 11.000 tỷ đồng
- Vay hơn 27.000 tỷ đồng mở rộng cao tốc TP HCM - Trung Lương - Mỹ Thuận
- VN-Index xuống mức thấp nhất ba tháng
- CII muốn vay hơn tỷ USD để mở rộng cao tốc TP HCM - Trung Lương - Mỹ Thuận
- Kinh tế Trung Quốc tăng chậm nhất 4 năm
- Cổ phiếu PNJ chạm trần
- Vietbank chào sàn HoSE, vốn hóa hơn 14.000 tỷ đồng
- World stocks fall in semiconductor rout; oil rises on Middle East escalation
- Fed rate-hike voices swell before July decision, rates still seen on hold
- US regional banks brush off war jitters with lending surge, fee boost
- China set to leave benchmark lending rates unchanged for 14th month in July
- Apple unseats Nvidia to become world's most valuable company as AI bets shift
- Meta, Anthropic in talks for potential $10 billion compute lease deal, source says
- 


---

## Disliked (Rule 5 — want less like this)

*Vague, soft, filler content — technically on-topic but not sharp or
useful to the target audience.*

- Chuyên gia: Không có kênh đầu tư nào chỉ tăng giá mà không giảm, nhà đầu tư cần chuẩn bị tâm lý sẵn
- Giám đốc cấp cao của VinaCapital: Đầu tư hiệu suất thấp trong 6 tháng qua là bình thường
- Khoảng 42,6% doanh nghiệp đang hoạt động có lãi
- Doanh nghiệp kỳ vọng thu hẹp khoảng cách từ chính sách đến thực thi
- Thị trường bất động sản đang trong quá trình thanh lọc
- Thúc đẩy AI tại Việt Nam: Từ hạ tầng sẵn sàng đến bài toán triển khai thực tiễn
- Giá vé trận tranh hạng ba World Cup giảm mạnh
- Mất hàng chục triệu đồng vì mua vàng qua fanpage giả mạo SJC
- PNJ tính thuê đơn vị quốc tế kiểm định quy trình và chất lượng kim cương
- Bài học từ các nền kinh tế sở hữu tập đoàn hàng đầu thế giới
- SGI Capital: Cơ hội mua cổ phiếu tốt với giá rẻ đang đến
- Musk's SpaceX in talks to supply the Pentagon with computing power, WSJ reports
- US judge won't block Meta from laying off workers who filed AI discrimination lawsuit
- Top US prosecutor will not dispute DOJ decision to drop Indian tycoon Gautam Adani's criminal case
- The economic goal that never came: World Cup falls short of boosting Mexico
- 

---

## Unsure / needs discussion

*Anything you're not sure which bucket it belongs in — flag it here and
we'll sort it out together.*

- (add examples here)
