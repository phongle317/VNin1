// scripts/fetch-feeds.mjs
import { XMLParser } from 'fast-xml-parser';
import he from 'he';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const { decode } = he;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ITEMS_PER_FEED     = 5;   // fetch up to 5 per source (training filters down)
const MAX_ARTICLES_PER_THEME = 8;   // display at most 8 per theme after filtering
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
        sourceId: 'thanhnien', sourceName: 'Thanh Niên',
        sourceUrl: 'https://thanhnien.vn', attribution: 'Thanh Niên',
        candidateUrls: ['https://thanhnien.vn/rss/kinh-te.rss']
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
        sourceId: 'thanhnien', sourceName: 'Thanh Niên',
        sourceUrl: 'https://thanhnien.vn', attribution: 'Thanh Niên',
        candidateUrls: ['https://thanhnien.vn/rss/kinh-te.rss']
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
        sourceId: 'thanhnien', sourceName: 'Thanh Niên',
        sourceUrl: 'https://thanhnien.vn', attribution: 'Thanh Niên',
        candidateUrls: ['https://thanhnien.vn/rss/kinh-te.rss']
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
  'tặng bằng khen', 'được khen thưởng', 'xuất sắc trong phong trào',
  'toàn dân', 'chào mừng kỷ niệm', 'kỷ niệm ngày',
  'chào bạn mới', 'ưu đãi khách hàng', 'khuyến mãi', 'tri ân khách hàng',
  'cam kết với người dân',
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

async function groqCall(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const res = await fetchWithTimeout(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
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

  const titleList = articles.map((a, i) => (i + 1) + '. ' + a.title).join('\n');
  const likedList  = training.liked.length  ? training.liked.map(t => '- ' + t).join('\n')  : '(none yet)';
  const dislikedList = training.disliked.length ? training.disliked.map(t => '- ' + t).join('\n') : '(none yet)';

  const prompt = 'You are a news relevance filter for a Vietnamese financial news reader.\n\n'
    + 'The reader LIKES stories like these:\n' + likedList + '\n\n'
    + 'The reader DISLIKES stories like these:\n' + dislikedList + '\n\n'
    + 'Score each headline below 1-10 for relevance to this reader\'s taste.\n'
    + 'Return ONLY a JSON array of objects with "index" (1-based) and "score" fields.\n'
    + 'Example: [{"index":1,"score":8},{"index":2,"score":3}]\n\n'
    + 'Headlines:\n' + titleList;

  try {
    const raw = await groqCall(prompt);
    const clean = raw.replace(/```json|```/g, '').trim();
    const scores = JSON.parse(clean);

    // Combine relevance score with recency bonus
    const now = Date.now();
    const scored = articles.map((a, i) => {
      const s = scores.find(x => x.index === i + 1);
      const relevance = s?.score ?? 5;
      // Recency bonus: articles from last 6 hours get +2, last 24h get +1
      const ageHours = a.pubDate ? (now - new Date(a.pubDate).getTime()) / 3600000 : 48;
      const recencyBonus = ageHours < 6 ? 2 : ageHours < 24 ? 1 : 0;
      return { ...a, _score: relevance + recencyBonus };
    });

    scored.sort((a, b) => b._score - a._score);

    // Drop clearly irrelevant (score < 3) but always keep at least 4 articles
    const MIN_KEEP = 4;
    const filtered = scored.filter(a => a._score >= 3);
    const result = (filtered.length >= MIN_KEEP ? filtered : scored).slice(0, maxArticles);
    console.log('  \u2713 Training filter: ' + result.length + '/' + articles.length + ' kept');
    return result.map(({ _score, ...a }) => a);
  } catch (err) {
    console.warn('  \u26a0 Training scorer failed: ' + err.message + ' — using unfiltered articles');
    return articles.slice(0, maxArticles);
  }
}

async function fetchTheme(theme, training) {
  console.log('\nFetching theme: ' + theme.displayName);
  const allArticles = (await Promise.all(theme.feeds.map(fetchOneFeed))).flat();

  // Sort newest-first
  allArticles.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });

  // Content-type filter (blocklist)
  const isIntl = theme.key === 'international';
  const filtered = filterArticles(allArticles, isIntl);
  const dropped = allArticles.length - filtered.length;
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

// ─── AI summaries (Groq) ──────────────────────────────────────────────────────
async function generateSummary(themeName, themeKey, articles) {
  if (!process.env.GROQ_API_KEY) { console.warn('  \u26a0 GROQ_API_KEY not set'); return null; }
  if (articles.length === 0) return null;

  const headlines = articles.slice(0, 12).map((a, i) => (i + 1) + '. ' + a.title).join('\n');

  let prompt;
  if (themeKey === 'international') {
    prompt = 'You are a financial wire editor. Based only on these headlines, write a 2-sentence Vietnamese summary (max 40 words total).\n\n'
      + 'STRUCTURE:\n'
      + 'Sentence 1: What happened — specific: index names, % moves, company names.\n'
      + 'Sentence 2: Why/context — one sharp causal factor.\n\n'
      + 'RULES: No filler. Lead with numbers/names. Vietnamese only. No speculation. Start directly.\n\n'
      + 'GOOD: "S&P 500 tăng 1,7% sau số liệu việc làm Mỹ yếu hơn dự báo. Khả năng Fed cắt lãi suất sớm tăng lên."\n\n'
      + 'Headlines:\n' + headlines;
  } else {
    prompt = 'Bạn là biên tập viên tin tức tài chính. Viết tóm tắt cho mục "' + themeName + '":\n\n'
      + 'CẤU TRÚC (2 câu, tối đa 40 từ):\n'
      + 'Câu 1: Điều gì xảy ra — số liệu, tên công ty, mức thay đổi cụ thể.\n'
      + 'Câu 2: Tại sao — một nguyên nhân ngắn gọn.\n\n'
      + 'KHÔNG dùng: "các tiêu đề cho thấy", "thị trường đang", "đáng chú ý".\n'
      + 'Bắt đầu TRỰC TIẾP. Chỉ dùng thông tin từ tiêu đề. Tiếng Việt có dấu đầy đủ.\n\n'
      + 'VÍ DỤ: "PNJ giảm kịch sàn, dư bán 12,5 triệu đơn vị sau vụ khởi tố giám đốc P-Lab. Nhóm cổ phiếu chứng khoán nhỏ tăng hơn 14%, dẫn đầu thanh khoản."\n\n'
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

  // 1. Fetch all themes (includes content filter + training scorer)
  const themeResults = [];
  for (const theme of THEMES) {
    const articles = await fetchTheme(theme, training);
    themeResults.push({ key: theme.key, displayName: theme.displayName, articles });
  }

  // 2. Market data
  console.log('\nFetching market data...');
  const [indices, usdvnd, goldVnd, goldUsd, globalIndices] = await Promise.all([
    fetchMarketIndices(), fetchUsdVnd(), fetchGoldVnd(), fetchGoldUsd(), fetchGlobalIndices()
  ]);
  const marketOpen = isMarketOpen();

  // 3. AI summaries
  console.log('\nGenerating AI summaries...');
  for (const theme of themeResults) {
    theme.aiSummary = await generateSummary(theme.displayName, theme.key, theme.articles);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 4. Write output
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
