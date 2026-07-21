// scripts/fetch-feeds.mjs
import { XMLParser } from 'fast-xml-parser';
import he from 'he';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const { decode } = he;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ITEMS_PER_FEED     = 5;   // fetch up to 5 per source (training filters down)
const MAX_ARTICLES_PER_THEME = 8;   // display at most 8 per theme after filtering
const SCORE_BATCH_LIMIT      = 20;  // cap articles sent to Groq for scoring per theme —
                                     // keeps prompt/response size predictable as more
                                     // sources get added, avoids TPM rate-limit risk
const EXCERPT_LENGTH         = 160;
const FETCH_TIMEOUT_MS       = 15000;

// ─── AI provider: Groq ────────────────────────────────────────────────────────
// Free tier: 14,400 RPD — sufficient for hourly summaries + training scoring
// Swap model here if needed; interface stays constant
const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// ─── Theme + source config ────────────────────────────────────────────────────
// To add a source: add a feed entry to the relevant theme.
// To add a theme: add a new object to THEMES.
// To reorder sections: reorder the THEMES array.
// Nothing else in the codebase needs to change.

const THEMES = [
  {
    key: 'stocks',
    displayName: 'Chứng khoán',
    feeds: [
      {
        sourceId: 'cafef', sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn', attribution: 'CafeF',
        candidateUrls: ['https://cafef.vn/thi-truong-chung-khoan.rss', 'https://cafef.vn/chung-khoan.rss']
      },
      {
        sourceId: 'vneconomy', sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn', attribution: 'VnEconomy',
        candidateUrls: ['https://vneconomy.vn/chung-khoan.rss']
      },
      {
        sourceId: 'vnexpress', sourceName: 'VnExpress',
        sourceUrl: 'https://vnexpress.net', attribution: 'VnExpress',
        candidateUrls: ['https://vnexpress.net/rss/kinh-doanh.rss']
      },
      {
        sourceId: 'vietstock', sourceName: 'Vietstock',
        sourceUrl: 'https://vietstock.vn', attribution: 'Vietstock',
        candidateUrls: ['https://vietstock.vn/757/tai-chinh/ngan-hang.rss']
      },
      {
        sourceId: 'cafebiz', sourceName: 'CafeBiz',
        sourceUrl: 'https://cafebiz.vn', attribution: 'CafeBiz',
        candidateUrls: ['https://cafebiz.vn/rss/ngan-hang-tai-chinh.rss']
      }
    ]
  },
  {
    key: 'realestate',
    displayName: 'Bất động sản',
    feeds: [
      {
        sourceId: 'cafef', sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn', attribution: 'CafeF',
        candidateUrls: ['https://cafef.vn/bat-dong-san.rss']
      },
      {
        sourceId: 'vneconomy', sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn', attribution: 'VnEconomy',
        candidateUrls: ['https://vneconomy.vn/dia-oc.rss']
      },
      {
        sourceId: 'vnexpress', sourceName: 'VnExpress',
        sourceUrl: 'https://vnexpress.net', attribution: 'VnExpress',
        candidateUrls: ['https://vnexpress.net/rss/bat-dong-san.rss']
      },
      {
        sourceId: 'cafebiz', sourceName: 'CafeBiz',
        sourceUrl: 'https://cafebiz.vn', attribution: 'CafeBiz',
        candidateUrls: ['https://cafebiz.vn/rss/bat-dong-san.rss']
      }
    ]
  },
  {
    key: 'macro',
    displayName: 'Vĩ mô / Đầu tư',
    feeds: [
      {
        sourceId: 'cafef', sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn', attribution: 'CafeF',
        candidateUrls: ['https://cafef.vn/vi-mo-dau-tu.rss']
      },
      {
        sourceId: 'vneconomy', sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn', attribution: 'VnEconomy',
        candidateUrls: ['https://vneconomy.vn/dau-tu.rss', 'https://vneconomy.vn/tieu-diem.rss']
      },
      {
        sourceId: 'vnexpress', sourceName: 'VnExpress',
        sourceUrl: 'https://vnexpress.net', attribution: 'VnExpress',
        candidateUrls: ['https://vnexpress.net/rss/kinh-doanh.rss']
      },
      {
        sourceId: 'cafebiz', sourceName: 'CafeBiz',
        sourceUrl: 'https://cafebiz.vn', attribution: 'CafeBiz',
        candidateUrls: ['https://cafebiz.vn/rss/dau-tu.rss']
      }
    ]
  },
  {
    key: 'international',
    displayName: 'International',
    feeds: [
      {
        sourceId: 'cnbc', sourceName: 'CNBC',
        sourceUrl: 'https://www.cnbc.com', attribution: 'CNBC',
        candidateUrls: ['https://www.cnbc.com/id/20910258/device/rss/rss.html', 'https://www.cnbc.com/id/100003114/device/rss/rss.html']
      },
      {
        sourceId: 'ft', sourceName: 'Financial Times',
        sourceUrl: 'https://www.ft.com', attribution: 'FT',
        candidateUrls: [
          'https://www.ft.com/rss/home/uk',
          'https://www.ft.com/?format=rss'
        ]
      },
      {
        sourceId: 'scmp', sourceName: 'SCMP',
        sourceUrl: 'https://www.scmp.com', attribution: 'SCMP',
        candidateUrls: ['https://www.scmp.com/rss/5/feed', 'https://www.scmp.com/rss/91/feed']
      },
      {
        sourceId: 'vietstock', sourceName: 'Vietstock',
        sourceUrl: 'https://vietstock.vn', attribution: 'Vietstock',
        candidateUrls: ['https://vietstock.vn/773/the-gioi/chung-khoan-the-gioi.rss']
      },
      {
        sourceId: 'marketwatch', sourceName: 'MarketWatch',
        sourceUrl: 'https://www.marketwatch.com', attribution: 'MarketWatch',
        candidateUrls: ['https://feeds.content.dowjones.io/public/rss/mw_topstories']
      },
      {
        sourceId: 'wsj', sourceName: 'WSJ',
        sourceUrl: 'https://www.wsj.com', attribution: 'WSJ',
        candidateUrls: ['https://feeds.content.dowjones.io/public/rss/RSSMarketsMain']
      }
    ]
  }
];

// ─── Market data config ───────────────────────────────────────────────────────
const MARKET_CONFIG = {
  indices: {
    candidateUrls: [
      'https://finfo-api.vndirect.com.vn/v4/stock_prices/?q=code:VNINDEX,HNXINDEX&sort=date&size=2&page=1&fields=code,close,change,percentChange,totalMatchVolume',
      'https://finfo-api.vndirect.com.vn/v4/stock_prices/?q=code:VNINDEX&sort=date&size=1&page=1&fields=code,close,change,percentChange,totalMatchVolume'
    ]
  },
  usdvnd: {
    candidateUrls: ['https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10']
  },
  goldVnd: {
    candidateUrls: [
      'https://giavang.org/api/giavang.json',
      'https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v'
    ]
  },
  goldUsd: {
    candidateUrls: [
      'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d',
      'https://query2.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d'
    ]
  }
};

// Global indices for International section bar
const GLOBAL_INDICES = [
  { symbol: '^GSPC',  name: 'S&P 500',   region: 'US'     },
  { symbol: '^IXIC',  name: 'Nasdaq',    region: 'US'     },
  { symbol: '^N225',  name: 'Nikkei',    region: 'Asia'   },
  { symbol: '^HSI',   name: 'Hang Seng', region: 'Asia'   },
  { symbol: '^GDAXI', name: 'DAX',       region: 'Europe' }
];

// ─── Content filter ───────────────────────────────────────────────────────────
// Content-type only — no province filtering.
// Province mentions are fine; awards/promos/political fluff are not.
const CONTENT_BLOCKLIST = [
  // Awards / propaganda-flavored (original set)
  'tặng bằng khen', 'được khen thưởng', 'xuất sắc trong phong trào',
  'toàn dân', 'chào mừng kỷ niệm', 'kỷ niệm ngày',
  'chào bạn mới', 'ưu đãi khách hàng', 'khuyến mãi', 'tri ân khách hàng',
  'cam kết với người dân',
  // Corporate PR / soft promotion — added 2026-07-18, see CONTENT_RULES.md Rule 4
  'mở rộng đầu tư', 'đồng hành cùng việt nam', 'khai trương',
  'mở rộng hệ sinh thái', 'nâng cấp hợp tác', 'hút fdi chất lượng cao',
  'cơ hội mua cổ phiếu', 'tâm điểm thương mại', 'chu kỳ phát triển mới',
  'siêu đô thị', 'mái nhà của', 'tăng cơ hội kinh doanh cho đối tác',
  'được phép bán cho người nước ngoài', 'thu hút nhà thầu phụ',
  // Government/Party rhetoric — added 2026-07-18
  'quyết liệt thực hiện mục tiêu', 'từ cam kết sang kết quả',
];

const INTL_BLOCKLIST = [
  'social security', 'my doctor', 'my husband', 'my wife', 'my boss',
  'dear quentin', 'dear moneyist', 'fundraising tactics', 'working at walmart',
  'i claimed', 'i retired', 'how to save', 'how to pay',
  'opinion:', 'column:', 'commentary:',
];

function filterArticles(articles, isInternational = false) {
  const lower = s => (s ?? '').toLowerCase();
  if (isInternational) {
    return articles.filter(a => {
      const text = lower(a.title) + ' ' + lower(a.excerpt);
      return !INTL_BLOCKLIST.some(p => text.includes(p));
    });
  }
  return articles.filter(a => {
    const text = lower(a.title) + ' ' + lower(a.excerpt);
    return !CONTENT_BLOCKLIST.some(p => text.includes(lower(p)));
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function loadEnv() {
  try {
    const raw = await readFile(path.resolve('.env'), 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {}
}

async function loadTraining() {
  try {
    const raw = await readFile(path.resolve('src/data/training.json'), 'utf-8');
    const data = JSON.parse(raw);
    return { liked: data.liked ?? [], disliked: data.disliked ?? [] };
  } catch {
    return { liked: [], disliked: [] };
  }
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  parseTagValue: true
});

function stripTags(html = '') {
  return decode(
    html
      .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim()
  );
}

function truncate(text, len) {
  if (!text || text.length <= len) return text;
  const cut = text.slice(0, len);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

function getText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object' && '__cdata' in node) return String(node.__cdata);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']);
  return '';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VNin1Bot/1.0) AstroFeedFetcher',
        Accept: 'application/rss+xml, application/xml, application/json, text/xml, */*',
        ...options.headers
      },
      ...options
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function groqCall(prompt, maxTokens = 300) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const res = await fetchWithTimeout(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2
    })
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from Groq');
  return text;
}

// ─── RSS fetching ─────────────────────────────────────────────────────────────
async function fetchOneFeed(feed) {
  for (const url of feed.candidateUrls) {
    try {
      const res     = await fetchWithTimeout(url);
      const xml     = await res.text();
      const parsed  = xmlParser.parse(xml);
      // Handle both RSS (<channel><item>) and Atom (<feed><entry>) formats
      const channel = parsed?.rss?.channel;
      const atomFeed = parsed?.feed;
      if (!channel && !atomFeed) throw new Error('No <channel> or <feed> in XML');

      let items;
      if (channel) {
        items = channel.item ?? [];
        if (!Array.isArray(items)) items = [items];
      } else {
        // Atom format — map entry fields to RSS field names
        const entries = atomFeed.entry ?? [];
        items = (Array.isArray(entries) ? entries : [entries]).map(e => ({
          title:   e.title,
          link:    e.link?.['@_href'] ?? e.link ?? '',
          pubDate: e.published ?? e.updated ?? '',
          description: e.summary ?? e.content ?? ''
        }));
      }
      const articles = items
        .slice(0, MAX_ITEMS_PER_FEED)
        .map(item => ({
          title:       stripTags(getText(item.title)),
          link:        getText(item.link).trim(),
          pubDate:     getText(item.pubDate) ? new Date(getText(item.pubDate)).toISOString() : null,
          excerpt:     truncate(stripTags(getText(item.description)), EXCERPT_LENGTH),
          sourceId:    feed.sourceId,
          sourceName:  feed.sourceName,
          sourceUrl:   feed.sourceUrl,
          attribution: feed.attribution
        }))
        .filter(a => a.title && a.link);
      console.log('  \u2713 ' + feed.sourceName + ': ' + articles.length + ' articles');
      return articles;
    } catch (err) {
      console.warn('  \u26a0 ' + feed.sourceName + ': ' + url + ' \u2014 ' + err.message);
    }
  }
  console.error('  \u2717 ' + feed.sourceName + ': all URLs failed');
  return [];
}

// ─── Training scorer ──────────────────────────────────────────────────────────
// Scores articles against liked/disliked examples via Groq.
// Only activates when training.json has at least one example.
// Empty training.json = pass all articles through unchanged.
async function scoreAndFilter(articles, training, maxArticles) {
  const hasExamples = training.liked.length > 0 || training.disliked.length > 0;
  if (!hasExamples) {
    // No training data yet — take top maxArticles as-is
    return articles.slice(0, maxArticles);
  }

  // Cách A — cap how many articles get sent to Groq for scoring. `articles`
  // is already sorted newest-first (from fetchTheme), so this keeps the
  // freshest ones and just excludes the older overflow from the AI call
  // entirely — they still exist as a safety-net pool below, just unscored.
  const toScore = articles.slice(0, SCORE_BATCH_LIMIT);
  const overflow = articles.slice(SCORE_BATCH_LIMIT);

  const titleList = toScore.map((a, i) => (i + 1) + '. ' + a.title).join('\n');
  const likedList  = training.liked.length  ? training.liked.map(t => '- ' + t).join('\n')  : '(none yet)';
  const dislikedList = training.disliked.length ? training.disliked.map(t => '- ' + t).join('\n') : '(none yet)';

  const prompt = 'You are a news relevance filter and duplicate-detector for a Vietnamese financial news reader.\n\n'
    + 'The reader LIKES stories like these:\n' + likedList + '\n\n'
    + 'The reader DISLIKES stories like these:\n' + dislikedList + '\n\n'
    + 'TASK 1 — Score each headline below 1-10 for relevance to this reader\'s taste.\n\n'
    + 'TASK 2 — Some headlines may describe the SAME real-world event or story, just '
    + 'written differently by different outlets (e.g. two outlets both covering the same '
    + 'company announcement, project groundbreaking, or policy change, with different '
    + 'wording). Group any such headlines together by their index number.\n\n'
    + 'Return ONLY a JSON object with this exact shape, nothing else:\n'
    + '{"scores":[{"index":1,"score":8},{"index":2,"score":3}],"duplicateGroups":[[3,7],[5,12]]}\n'
    + '"duplicateGroups" holds arrays of 2+ indices that describe the same event. '
    + 'If none found, use an empty array for "duplicateGroups".\n\n'
    + 'Headlines:\n' + titleList;

  try {
    // Needs a generous token budget: with 11 sources some themes can have
    // 25-30 articles, and the JSON response now includes both per-article
    // scores AND duplicate-group indices. The old 300-token default (fine
    // for short AI summaries) was truncating this response on themes with
    // many sources — confirmed via two real runs both failing exactly on
    // the highest-article-count themes. 1500 gives ample headroom even as
    // more sources get added later.
    const raw = await groqCall(prompt, 1500);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const scores = parsed.scores ?? [];
    const duplicateGroups = parsed.duplicateGroups ?? [];

    // Combine relevance score with recency bonus (only for the batch that was
    // actually sent to Groq — toScore)
    const now = Date.now();
    const scored = toScore.map((a, i) => {
      const s = scores.find(x => x.index === i + 1);
      const relevance = s?.score ?? 5;
      // Recency bonus: articles from last 6 hours get +2, last 24h get +1
      const ageHours = a.pubDate ? (now - new Date(a.pubDate).getTime()) / 3600000 : 48;
      const recencyBonus = ageHours < 6 ? 2 : ageHours < 24 ? 1 : 0;
      return { ...a, _score: relevance + recencyBonus };
    });

    // Cross-source content-similarity dedup (Rule 1b) — same real-world event
    // covered by different outlets under different links, so the exact-link
    // dedup in fetchTheme() can't catch it. Within each group flagged by
    // Groq, keep only the highest-scoring article, drop the rest.
    const dropIndices = new Set();
    for (const group of duplicateGroups) {
      if (!Array.isArray(group) || group.length < 2) continue;
      let bestIdx = null, bestScore = -Infinity;
      for (const idx of group) {
        const s = scored[idx - 1];
        if (!s) continue;
        if (s._score > bestScore) { bestScore = s._score; bestIdx = idx; }
      }
      for (const idx of group) {
        if (idx !== bestIdx) dropIndices.add(idx);
      }
    }
    const deduped = scored.filter((a, i) => !dropIndices.has(i + 1));
    if (dropIndices.size > 0) {
      console.log('  \u2713 Cross-source dedup: ' + dropIndices.size + ' similar-content duplicate(s) dropped');
    }

    deduped.sort((a, b) => b._score - a._score);

    // Drop clearly irrelevant (score < 3) but always keep at least 4 articles.
    // If the scored batch alone can't reach MIN_KEEP, fall back to the
    // unscored overflow pool (oldest articles, excluded from the Groq call
    // by SCORE_BATCH_LIMIT) rather than showing fewer than 4 articles.
    const MIN_KEEP = 4;
    const filtered = deduped.filter(a => a._score >= 3);
    let result = (filtered.length >= MIN_KEEP ? filtered : deduped).slice(0, maxArticles);
    if (result.length < MIN_KEEP && overflow.length > 0) {
      result = result.concat(overflow.slice(0, MIN_KEEP - result.length));
    }
    console.log('  \u2713 Training filter: ' + result.length + '/' + articles.length + ' kept');
    return result.map(({ _score, ...a }) => a);
  } catch (err) {
    console.warn('  \u26a0 Training scorer failed: ' + err.message + ' — using unfiltered articles');
    return articles.slice(0, maxArticles);
  }
}

async function fetchTheme(theme, training, seenLinks) {
  console.log('\nFetching theme: ' + theme.displayName);
  const allArticles = (await Promise.all(theme.feeds.map(fetchOneFeed))).flat();

  // Sort newest-first
  allArticles.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });

  // Cross-theme dedup — same story must appear in only one section.
  // Some feeds (e.g. Thanh Niên kinh-te.rss, VnExpress kinh-doanh.rss) are
  // reused across multiple themes, so the same article link can surface in
  // more than one theme. Earlier themes in the THEMES array win; later
  // themes lose the duplicate and just show one fewer article from it.
  const deduped = allArticles.filter(a => {
    if (seenLinks.has(a.link)) return false;
    seenLinks.add(a.link);
    return true;
  });
  const dupCount = allArticles.length - deduped.length;
  if (dupCount > 0) console.log('  ' + dupCount + ' duplicate(s) dropped (already in another section)');

  // Content-type filter (blocklist)
  const isIntl = theme.key === 'international';
  const filtered = filterArticles(deduped, isIntl);
  const dropped = deduped.length - filtered.length;
  if (dropped > 0) console.log('  ' + dropped + ' articles dropped by content filter');

  // Training scorer (activates only when training.json has examples)
  const final = await scoreAndFilter(filtered, training, MAX_ARTICLES_PER_THEME);
  return final;
}

// ─── Market data ──────────────────────────────────────────────────────────────
function isMarketOpen() {
  const now    = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const day    = vnTime.getDay();
  const timeNum = vnTime.getHours() * 100 + vnTime.getMinutes();
  return day >= 1 && day <= 5 && timeNum >= 900 && timeNum < 1500;
}

async function fetchMarketIndices() {
  for (const url of MARKET_CONFIG.indices.candidateUrls) {
    try {
      const res   = await fetchWithTimeout(url);
      const data  = await res.json();
      const items = data?.data ?? [];
      const vnIndex  = items.find(i => i.code === 'VNINDEX');
      const hnxIndex = items.find(i => i.code === 'HNXINDEX');
      if (!vnIndex && !hnxIndex) throw new Error('No index data');
      console.log('  \u2713 VN market indices');
      return {
        vnIndex:  vnIndex  ? { value: vnIndex.close,  change: vnIndex.change,  changePercent: vnIndex.percentChange  } : null,
        hnxIndex: hnxIndex ? { value: hnxIndex.close, change: hnxIndex.change, changePercent: hnxIndex.percentChange } : null
      };
    } catch (err) {
      console.warn('  \u26a0 Market indices: ' + err.message);
    }
  }
  return { vnIndex: null, hnxIndex: null };
}

async function fetchUsdVnd() {
  for (const url of MARKET_CONFIG.usdvnd.candidateUrls) {
    try {
      const res    = await fetchWithTimeout(url);
      const xml    = await res.text();
      const parsed = xmlParser.parse(xml);
      const exrates = parsed?.ExrateList?.Exrate ?? [];
      const list    = Array.isArray(exrates) ? exrates : [exrates];
      const usd     = list.find(e => e['@_CurrencyCode'] === 'USD');
      if (!usd) throw new Error('USD rate not found');
      const sell = parseFloat(String(usd['@_Sell']).replace(',', ''));
      console.log('  \u2713 USD/VND: ' + sell);
      return { value: sell, source: 'Vietcombank' };
    } catch (err) {
      console.warn('  \u26a0 USD/VND: ' + err.message);
    }
  }
  return null;
}

async function fetchGoldVnd() {
  for (const url of MARKET_CONFIG.goldVnd.candidateUrls) {
    try {
      const res    = await fetchWithTimeout(url);
      const xml    = await res.text();
      const parsed = xmlParser.parse(xml);
      const cities   = parsed?.root?.city ?? parsed?.giatot?.city ?? [];
      const cityList = Array.isArray(cities) ? cities : [cities];
      let sell = null;
      for (const city of cityList) {
        const rows = Array.isArray(city?.row) ? city.row : [city?.row].filter(Boolean);
        for (const row of rows) {
          const type = String(row['@_type'] ?? '').toLowerCase();
          if (type.includes('sjc') && type.includes('1l')) {
            const raw = String(row?.sell ?? '').replace(/[,.]/g, '');
            const val = parseFloat(raw);
            if (!isNaN(val) && val > 1000) { sell = val > 100000 ? val : val * 1000; break; }
          }
        }
        if (sell) break;
      }
      if (!sell) throw new Error('Price not parsed');
      console.log('  \u2713 Gold VND: ' + sell.toLocaleString());
      return { value: sell, unit: 'VND/lượng', source: 'SJC' };
    } catch (err) {
      console.warn('  \u26a0 Gold VND: ' + url + ' \u2014 ' + err.message);
    }
  }
  return null;
}

async function fetchGoldUsd() {
  for (const url of MARKET_CONFIG.goldUsd.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' }
      });
      const data = await res.json();
      const meta  = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice ?? meta?.previousClose;
      if (!price) throw new Error('Price not found');
      const rounded = Math.round(price * 100) / 100;
      console.log('  \u2713 Gold USD: $' + rounded);
      return { value: rounded, unit: 'USD/oz', source: 'Yahoo Finance' };
    } catch (err) {
      console.warn('  \u26a0 Gold USD: ' + err.message);
    }
  }
  return null;
}

async function fetchOneGlobalIndex(idx) {
  const sym  = encodeURIComponent(idx.symbol);
  const urls = [
    'https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=5d',
    'https://query2.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=5d'
  ];
  for (const url of urls) {
    try {
      const res  = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' }
      });
      const data       = await res.json();
      const meta       = data?.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('No meta');
      const value      = meta.regularMarketPrice ?? meta.previousClose ?? null;
      const prevClose  = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change     = value != null && prevClose != null ? value - prevClose : null;
      const changePct  = change != null && prevClose ? (change / prevClose) * 100 : null;
      return { ...idx, value, change, changePercent: changePct };
    } catch (err) {
      console.warn('  \u26a0 ' + idx.name + ': ' + err.message);
    }
  }
  return { ...idx, value: null, change: null, changePercent: null };
}

async function fetchGlobalIndices() {
  console.log('  Fetching global indices...');
  const results = await Promise.all(GLOBAL_INDICES.map(fetchOneGlobalIndex));
  const success = results.filter(i => i.value != null).length;
  console.log('  \u2713 Global indices: ' + success + '/' + results.length);
  return results;
}

// ─── Per-article AI condensing (Rule 3, per-article) ──────────────────────────
// Replaces the raw RSS excerpt with an AI-written summary in the reader's own
// words. Runs on the FINAL selected articles per theme (post dedup/blocklist/
// scoring — usually ≤8), not the raw fetch pool, keeping the batch small and
// the JSON response small (lesson learned from the scorer's truncation bug).
// One Groq call per theme returns an array covering every article in that
// theme — each article still gets its own distinct summary, this just avoids
// making 8 separate network calls per theme.
async function condenseArticles(themeName, themeKey, articles) {
  if (articles.length === 0) return articles;
  if (!process.env.GROQ_API_KEY) {
    console.warn('  \u26a0 GROQ_API_KEY not set — condensing skipped');
    return articles.map(a => ({ ...a, condensed: null }));
  }

  const isIntl = themeKey === 'international';
  const list = articles
    .map((a, i) => (i + 1) + '. ' + a.title + (a.excerpt ? ' — ' + a.excerpt : ''))
    .join('\n');

  const prompt = isIntl
    ? 'You are a financial wire editor. For each numbered headline+excerpt below, '
      + 'write an ORIGINAL English summary in your own words (never copy phrasing '
      + 'from the excerpt) as ONE flowing sentence or two, 30-45 words — never a '
      + 'numbered or bulleted list within the summary text itself. Weave in — only '
      + 'if the text actually supports it — what happened, when, where, why, and '
      + 'impact/consequence, in that priority order.\n\n'
      + 'STRICT RULE: If the text does not support one of those points, leave it out '
      + '— do NOT invent, guess, or infer one that isn\'t there. Fabrication is '
      + 'forbidden under all circumstances, even to make an item feel complete. '
      + 'No filler like "reports say" or "according to".\n\n'
      + 'Return ONLY a JSON array, nothing else: [{"index":1,"summary":"..."}]\n'
      + 'The "summary" value must be plain prose — never starting with "1.", "-", '
      + 'or any list marker.\n'
      + 'If you are not confident summarizing an item accurately at all, OMIT it '
      + 'from the array rather than guessing.\n\nItems:\n' + list
    : 'Bạn là biên tập viên tài chính. Với mỗi tiêu đề + trích đoạn được đánh số '
      + 'dưới đây, viết một tóm tắt tiếng Việt HOÀN TOÀN BẰNG LỜI VĂN CỦA BẠN '
      + '(không sao chép câu chữ từ trích đoạn gốc) dưới dạng MỘT đến hai câu văn '
      + 'liền mạch, 30-45 từ — không bao giờ ở dạng danh sách đánh số bên trong nội '
      + 'dung tóm tắt. Lồng ghép — chỉ khi nguồn thực sự có dữ kiện — theo thứ tự ưu '
      + 'tiên: điều gì xảy ra, khi nào, ở đâu, tại sao, và tác động/hệ quả.\n\n'
      + 'QUY TẮC NGHIÊM NGẶT: Nếu nguồn không có dữ liệu cho một thành phần nào, BỎ '
      + 'QUA thành phần đó — TUYỆT ĐỐI KHÔNG bịa, suy đoán, hoặc thêm chi tiết không '
      + 'có trong nguồn, dưới bất kỳ hình thức nào, kể cả để câu văn nghe đầy đủ hơn. '
      + 'Không dùng "theo đó", "được biết".\n\n'
      + 'Chỉ trả về JSON, không thêm gì khác: [{"index":1,"summary":"..."}]\n'
      + 'Giá trị "summary" phải là văn xuôi bình thường — không bao giờ bắt đầu bằng '
      + '"1.", "-", hay ký hiệu liệt kê.\n'
      + 'Nếu không đủ tự tin tóm tắt chính xác một mục nào, BỎ QUA mục đó thay vì '
      + 'đoán bừa.\n\nDanh sách:\n' + list;

  const attempt = async () => {
    const raw = await groqCall(prompt, 1200); // small batch (≤8 items) — ample headroom
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  };

  let results = [];
  try {
    results = await attempt();
  } catch (err) {
    console.warn('  \u26a0 Condensing "' + themeName + '" failed (try 1): ' + err.message + ' — retrying once');
    try {
      results = await attempt();
    } catch (err2) {
      console.warn('  \u26a0 Condensing "' + themeName + '" failed (try 2): ' + err2.message + ' — leaving blank');
      results = [];
    }
  }

  const withCondensed = articles.map((a, i) => {
    const r = results.find(x => x.index === i + 1);
    const summary = typeof r?.summary === 'string' ? r.summary.trim() : null;
    return { ...a, condensed: summary || null };
  });
  const gotCount = withCondensed.filter(a => a.condensed).length;
  console.log('  ' + (gotCount === articles.length ? '\u2713' : '\u26a0')
    + ' Condensed "' + themeName + '": ' + gotCount + '/' + articles.length);
  return withCondensed;
}

// ─── AI summaries (Groq) ──────────────────────────────────────────────────────
async function generateSummary(themeName, themeKey, articles) {
  if (!process.env.GROQ_API_KEY) { console.warn('  \u26a0 GROQ_API_KEY not set'); return null; }
  if (articles.length === 0) return null;

  // Include excerpt, not just title — headlines are often vague by design
  // ("Một địa phương...", "Doanh nghiệp nọ...") and the excerpt usually has
  // the specific name/number the headline omits. Without this, the AI
  // faithfully reflects a vague headline instead of being specific.
  const headlines = articles.slice(0, 12)
    .map((a, i) => (i + 1) + '. ' + a.title + (a.excerpt ? ' — ' + a.excerpt : ''))
    .join('\n');

  let prompt;
  if (themeKey === 'international') {
    prompt = 'You are a financial wire editor. Each item below has a headline and an '
      + 'excerpt (after the dash). Write ONE flowing Vietnamese paragraph (2-3 '
      + 'sentences, never a numbered or bulleted list) that weaves in — only if the '
      + 'text actually supports it — what happened, when, where, why, and the '
      + 'impact/consequence, in that priority order.\n\n'
      + 'STRICT RULE: If the text does not support one of those points, leave it out '
      + 'entirely — do NOT invent, guess, or infer a when/where/why/impact that '
      + 'isn\'t actually there. Fabrication is forbidden under all circumstances, even '
      + 'to make the summary feel more complete.\n\n'
      + 'FORMAT: Plain prose sentences only. Never start a line with "1.", "2.", "-", '
      + 'or any list marker — this must read as continuous paragraph text.\n\n'
      + 'Length: ~30-45 words, up to 50 if the source genuinely supports every point. '
      + 'If a headline is vague (e.g. "a company", "a region"), use the excerpt to name '
      + 'the specific entity instead. No filler. Vietnamese only. Start directly.\n\n'
      + 'GOOD (what+why+impact present, no specific when/where in source so both '
      + 'omitted): "S&P 500 tăng 1,7% sau số liệu việc làm Mỹ yếu hơn dự báo. Thị '
      + 'trường lao động hạ nhiệt nhanh hơn kỳ vọng. Khả năng Fed cắt lãi suất trong '
      + 'cuộc họp tới tăng lên rõ rệt."\n\n'
      + 'Headlines:\n' + headlines;
  } else {
    prompt = 'Bạn là biên tập viên tin tức tài chính. Mỗi mục dưới đây gồm tiêu đề và '
      + 'trích đoạn (sau dấu gạch ngang). Viết MỘT đoạn văn liền mạch (2-3 câu, KHÔNG '
      + 'BAO GIỜ ở dạng danh sách đánh số hay gạch đầu dòng) cho mục "' + themeName
      + '", lồng ghép — chỉ khi nguồn thực sự có dữ kiện — theo thứ tự ưu tiên: điều '
      + 'gì xảy ra, khi nào, ở đâu, tại sao, và tác động/hệ quả.\n\n'
      + 'QUY TẮC NGHIÊM NGẶT: Nếu nguồn không cung cấp dữ liệu cho một điểm nào, bỏ '
      + 'qua điểm đó hoàn toàn — TUYỆT ĐỐI KHÔNG bịa, suy đoán, hoặc thêm chi tiết '
      + 'không có trong tiêu đề/trích đoạn, dưới bất kỳ hình thức nào, kể cả để câu '
      + 'văn nghe đầy đủ hơn.\n\n'
      + 'ĐỊNH DẠNG: Chỉ viết văn xuôi bình thường. Không bao giờ bắt đầu dòng bằng '
      + '"1.", "2.", "-", hay bất kỳ ký hiệu liệt kê nào — phải đọc như một đoạn văn '
      + 'liền mạch.\n\n'
      + 'Độ dài: khoảng 30-45 từ, tối đa 50 từ nếu nguồn thực sự đủ dữ kiện cho mọi điểm.\n'
      + 'KHÔNG dùng: "các tiêu đề cho thấy", "thị trường đang", "đáng chú ý".\n'
      + 'Nếu tiêu đề mơ hồ (vd: "một địa phương", "doanh nghiệp nọ"), dùng trích đoạn '
      + 'để nêu đích danh — không để chung chung nếu trích đoạn đã có tên cụ thể.\n'
      + 'Bắt đầu TRỰC TIẾP. Tiếng Việt có dấu đầy đủ.\n\n'
      + 'VÍ DỤ (có what/why/impact, nguồn không nêu rõ khi nào/ở đâu nên bỏ qua 2 điểm '
      + 'đó): "PNJ giảm kịch sàn, dư bán 12,5 triệu đơn vị sau vụ khởi tố giám đốc '
      + 'P-Lab. Nhóm cổ phiếu chứng khoán nhỏ tăng hơn 14%, dẫn đầu thanh khoản. Tâm lý '
      + 'nhà đầu tư có thể còn thận trọng với nhóm ngành này trong ngắn hạn."\n\n'
      + 'Tiêu đề:\n' + headlines;
  }

  try {
    const summary = await groqCall(prompt);
    console.log('  \u2713 AI summary for "' + themeName + '": ' + summary.slice(0, 80) + '...');
    return summary;
  } catch (err) {
    console.warn('  \u26a0 Summary for "' + themeName + '": ' + err.message);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await loadEnv();
  const training = await loadTraining();
  const hasTraining = training.liked.length > 0 || training.disliked.length > 0;
  console.log('=== VNin1 feed fetch starting ===');
  if (hasTraining) {
    console.log('Training: ' + training.liked.length + ' liked, ' + training.disliked.length + ' disliked examples loaded');
  } else {
    console.log('Training: no examples yet (add to src/data/training.json to enable)');
  }
  console.log('');

  // 1. Fetch all themes (includes cross-theme dedup + content filter + training scorer)
  const themeResults = [];
  const seenLinks = new Set(); // shared across all themes — enforces Rule 1 (no duplicate stories)
  for (const theme of THEMES) {
    const articles = await fetchTheme(theme, training, seenLinks);
    themeResults.push({ key: theme.key, displayName: theme.displayName, articles });
    // Cách B — small gap between themes so the 4 scoring calls to Groq don't
    // all land in the same 60-second window (TPM rate-limit risk), now that
    // 11 sources mean longer prompts/responses than before.
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Market data
  console.log('\nFetching market data...');
  const [indices, usdvnd, goldVnd, goldUsd, globalIndices] = await Promise.all([
    fetchMarketIndices(), fetchUsdVnd(), fetchGoldVnd(), fetchGoldUsd(), fetchGlobalIndices()
  ]);
  const marketOpen = isMarketOpen();

  // 3. Per-article AI condensing (Rule 3, per-article) — replaces raw RSS
  // excerpt with AI-written text. Runs on final selected articles only.
  console.log('\nCondensing articles...');
  for (const theme of themeResults) {
    theme.articles = await condenseArticles(theme.displayName, theme.key, theme.articles);
    await new Promise(r => setTimeout(r, 2000)); // same TPM-safety gap as theme scoring
  }

  // 4. AI summaries
  console.log('\nGenerating AI summaries...');
  for (const theme of themeResults) {
    theme.aiSummary = await generateSummary(theme.displayName, theme.key, theme.articles);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 5. Write output
  const output = {
    lastUpdated: new Date().toISOString(),
    market: {
      vnIndex: indices.vnIndex, hnxIndex: indices.hnxIndex,
      usdVnd: usdvnd, goldVnd, goldUsd, marketOpen,
      note: marketOpen ? null : 'Thị trường đóng cửa — hiển thị giá đóng cửa gần nhất'
    },
    globalIndices,
    themes: themeResults
  };

  const outPath = path.resolve('src/data/feed.json');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');

  const total        = themeResults.reduce((sum, t) => sum + t.articles.length, 0);
  const summaryCount = themeResults.filter(t => t.aiSummary).length;
  console.log('\n=== Done ===');
  console.log('Articles: ' + total + ' across ' + themeResults.length + ' themes');
  console.log('AI summaries: ' + summaryCount + '/' + themeResults.length);
  console.log('Market open: ' + marketOpen);
  console.log('Output: ' + outPath);

  if (themeResults.every(t => t.articles.length === 0)) process.exitCode = 1;
}

main();
