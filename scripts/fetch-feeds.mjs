// scripts/fetch-feeds.mjs
import { XMLParser } from 'fast-xml-parser';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_ITEMS_PER_FEED    = 3;
const EXCERPT_LENGTH        = 160;
const FETCH_TIMEOUT_MS      = 15000;
const AI_SUMMARY_MAX_TOKENS = 300;

// ─── Theme + source config ────────────────────────────────────────────────────
const THEMES = [
  {
    key: 'stocks',
    displayName: 'Chứng khoán',
    feeds: [
      {
        sourceId: 'cafef', sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn', attribution: 'CafeF',
        candidateUrls: ['https://cafef.vn/thi-truong-chung-khoan.rss','https://cafef.vn/chung-khoan.rss']
      },
      {
        sourceId: 'vneconomy', sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn', attribution: 'VnEconomy',
        candidateUrls: ['https://vneconomy.vn/chung-khoan.rss']
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
        candidateUrls: ['https://vneconomy.vn/dau-tu.rss','https://vneconomy.vn/tieu-diem.rss']
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
        candidateUrls: [
          'https://www.cnbc.com/id/20910258/device/rss/rss.html',
          'https://www.cnbc.com/id/100003114/device/rss/rss.html'
        ]
      },
      {
        sourceId: 'cnbc2', sourceName: 'CNBC Markets',
        sourceUrl: 'https://www.cnbc.com', attribution: 'CNBC',
        candidateUrls: [
          'https://www.cnbc.com/id/15839135/device/rss/rss.html',
          'https://www.cnbc.com/id/10000664/device/rss/rss.html'
        ]
      },
      {
        sourceId: 'apbusiness', sourceName: 'AP News',
        sourceUrl: 'https://apnews.com', attribution: 'AP News',
        candidateUrls: [
          'https://apnews.com/hub/business.rss',
          'https://feeds.apnews.com/rss/apf-business'
        ]
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
    candidateUrls: ['https://sjc.com.vn/xml/tygiavang.xml']
  },
  goldUsd: {
    candidateUrls: ['https://data-asg.goldprice.org/dbXRates/USD']
  }
};

// Global indices shown inside the International section
// To add/remove: edit this array only — no other changes needed
const GLOBAL_INDICES = [
  { symbol: '^GSPC',  name: 'S&P 500',   region: 'US'     },
  { symbol: '^IXIC',  name: 'Nasdaq',    region: 'US'     },
  { symbol: '^N225',  name: 'Nikkei',    region: 'Asia'   },
  { symbol: '^HSI',   name: 'Hang Seng', region: 'Asia'   },
  { symbol: '^GDAXI', name: 'DAX',       region: 'Europe' }
];

// ─── Content filter ───────────────────────────────────────────────────────────
// DESIGN DECISION: filter on content TYPE only, not location.
// Province mentions are fine — many legit market stories involve provinces.
// We only drop articles that are clearly non-market by nature:
// awards, political ceremonies, promotional/ad content.
// Add new patterns here as config — no code change needed.
const CONTENT_BLOCKLIST = [
  // Awards / political ceremony
  'tặng bằng khen', 'được khen thưởng', 'xuất sắc trong phong trào',
  'toàn dân', 'chào mừng kỷ niệm', 'kỷ niệm 50 năm', 'kỷ niệm ngày',
  // Promotional / ad content
  'chào bạn mới', 'ưu đãi khách hàng', 'khuyến mãi', 'tri ân khách hàng',
  // Pure political fluff (no market relevance)
  'cam kết với người dân', 'mời gọi đầu tư hàng chục',
];

// Non-market content patterns for international English sources
// Personal finance, lifestyle, opinion pieces that aren't market-moving news
const INTL_BLOCKLIST = [
  'social security', 'my doctor', 'my husband', 'my wife', 'my boss',
  'dear quentin', 'dear moneyist', 'fundraising tactics', 'working at walmart',
  'labor of love', 'best places to retire', 'buying a home', 'paying off debt',
  'i claimed', 'i retired', 'i have a', 'how to save', 'how to pay',
  'opinion:', 'column:', 'commentary:', 'what to know about mail'
];

function filterArticles(articles, isInternational = false) {
  const lower = s => (s ?? '').toLowerCase();
  if (isInternational) {
    // For international: drop personal finance / lifestyle, keep market news
    return articles.filter(a => {
      const text = lower(a.title) + ' ' + lower(a.excerpt);
      return !INTL_BLOCKLIST.some(phrase => text.includes(phrase));
    });
  }
  // For VN sections: drop propaganda / ad content
  return articles.filter(a => {
    const text = lower(a.title) + ' ' + lower(a.excerpt);
    return !CONTENT_BLOCKLIST.some(phrase => text.includes(lower(phrase)));
  });
}

// ─── Gemini config ────────────────────────────────────────────────────────────
const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  parseTagValue: true
});

function stripTags(html = '') {
  return html
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    // Named entities
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'").replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
    .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    // Hex and decimal numeric entities
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\s+/g, ' ').trim();
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── RSS fetching ─────────────────────────────────────────────────────────────
async function fetchOneFeed(feed) {
  for (const url of feed.candidateUrls) {
    try {
      const res     = await fetchWithTimeout(url);
      const xml     = await res.text();
      const parsed  = xmlParser.parse(xml);
      const channel = parsed?.rss?.channel;
      if (!channel) throw new Error('No <channel> in XML');
      let items = channel.item ?? [];
      if (!Array.isArray(items)) items = [items];
      const articles = items
        .slice(0, MAX_ITEMS_PER_FEED)
        .map(item => {
          const title   = stripTags(getText(item.title));
          const link    = getText(item.link).trim();
          const pubRaw  = getText(item.pubDate);
          const pubDate = pubRaw ? new Date(pubRaw).toISOString() : null;
          const excerpt = truncate(stripTags(getText(item.description)), EXCERPT_LENGTH);
          return { title, link, pubDate, excerpt,
            sourceId: feed.sourceId, sourceName: feed.sourceName,
            sourceUrl: feed.sourceUrl, attribution: feed.attribution };
        })
        .filter(a => a.title && a.link);
      console.log(`  ✓ ${feed.sourceName} [${url.split('/').pop().slice(0,30)}]: ${articles.length} articles`);
      return articles;
    } catch (err) {
      console.warn(`  ⚠ ${feed.sourceName}: ${url} — ${err.message}`);
    }
  }
  console.error(`  ✗ ${feed.sourceName}: all URLs failed`);
  return [];
}

async function fetchTheme(theme) {
  console.log(`\nFetching theme: ${theme.displayName}`);
  const allArticles = (await Promise.all(theme.feeds.map(fetchOneFeed))).flat();
  allArticles.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
  const isIntl = theme.key === 'international';
  const clean = filterArticles(allArticles, isIntl);
  const dropped = allArticles.length - clean.length;
  if (dropped > 0) console.log(`  → ${dropped} articles dropped by content filter`);
  return clean;
}

// ─── Market data ──────────────────────────────────────────────────────────────
function isMarketOpen() {
  const now    = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const day    = vnTime.getDay();
  const hour   = vnTime.getHours();
  const min    = vnTime.getMinutes();
  return day >= 1 && day <= 5 && (hour * 100 + min) >= 900 && (hour * 100 + min) < 1500;
}

async function fetchMarketIndices() {
  for (const url of MARKET_CONFIG.indices.candidateUrls) {
    try {
      const res   = await fetchWithTimeout(url);
      const data  = await res.json();
      const items = data?.data ?? [];
      const vnIndex  = items.find(i => i.code === 'VNINDEX');
      const hnxIndex = items.find(i => i.code === 'HNXINDEX');
      if (!vnIndex && !hnxIndex) throw new Error('No index data in response');
      console.log(`  ✓ VN market indices from VNDirect`);
      return {
        vnIndex:  vnIndex  ? { value: vnIndex.close,  change: vnIndex.change,  changePercent: vnIndex.percentChange  } : null,
        hnxIndex: hnxIndex ? { value: hnxIndex.close, change: hnxIndex.change, changePercent: hnxIndex.percentChange } : null
      };
    } catch (err) {
      console.warn(`  ⚠ Market indices: ${url} — ${err.message}`);
    }
  }
  console.error('  ✗ Market indices: all sources failed');
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
      console.log(`  ✓ USD/VND: ${sell}`);
      return { value: sell, source: 'Vietcombank' };
    } catch (err) {
      console.warn(`  ⚠ USD/VND: ${url} — ${err.message}`);
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
            if (!isNaN(val) && val > 1000) {
              sell = val > 100000 ? val : val * 1000;
              break;
            }
          }
        }
        if (sell) break;
      }
      if (!sell) throw new Error('SJC price not parsed');
      console.log(`  ✓ Gold VND (SJC): ${sell.toLocaleString()}`);
      return { value: sell, unit: 'VND/lượng', source: 'SJC' };
    } catch (err) {
      console.warn(`  ⚠ Gold VND: ${url} — ${err.message}`);
    }
  }
  return null;
}

async function fetchGoldUsd() {
  for (const url of MARKET_CONFIG.goldUsd.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url);
      const data = await res.json();
      const item  = data?.items?.find(i => i.curr === 'USD');
      const price = item?.xauPrice ?? data?.price ?? data?.USD?.price;
      if (!price) throw new Error('Gold USD price not found');
      const rounded = Math.round(price * 100) / 100;
      console.log(`  ✓ Gold USD: $${rounded}`);
      return { value: rounded, unit: 'USD/oz', source: 'goldprice.org' };
    } catch (err) {
      console.warn(`  ⚠ Gold USD: ${url} — ${err.message}`);
    }
  }
  return null;
}

// ─── Global indices (Yahoo Finance unofficial API) ────────────────────────────
async function fetchOneGlobalIndex(idx) {
  const sym = encodeURIComponent(idx.symbol);
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`
  ];
  for (const url of urls) {
    try {
      const res  = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const data   = await res.json();
      const meta   = data?.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('No meta in chart response');
      const value         = meta.regularMarketPrice ?? meta.previousClose ?? null;
      const prevClose     = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change        = value != null && prevClose != null ? value - prevClose : null;
      const changePercent = change != null && prevClose ? (change / prevClose) * 100 : null;
      return { ...idx, value, change, changePercent };
    } catch (err) {
      console.warn(`  ⚠ ${idx.name}: ${err.message}`);
    }
  }
  return { ...idx, value: null, change: null, changePercent: null };
}

async function fetchGlobalIndices() {
  console.log('  Fetching global indices individually...');
  const results = await Promise.all(GLOBAL_INDICES.map(fetchOneGlobalIndex));
  const success = results.filter(i => i.value != null).length;
  console.log(`  ✓ Global indices: ${success}/${results.length} fetched`);
  return results;
}

// ─── AI summaries ─────────────────────────────────────────────────────────────
async function generateSummary(themeName, themeKey, articles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.warn('  \u26a0 GEMINI_API_KEY not set'); return null; }
  if (articles.length === 0) return null;

  const headlines = articles
    .slice(0, 12)
    .map((a, i) => (i + 1) + '. ' + a.title)
    .join('\n');

  let prompt;
  if (themeKey === 'international') {
    prompt = 'You are a financial wire editor. Based only on these headlines, write a 2-sentence Vietnamese summary (max 40 words total).\n\n'
      + 'STRUCTURE:\n'
      + 'Sentence 1: What happened — be specific: index names, % moves, company names.\n'
      + 'Sentence 2: Why/context — one sharp causal factor.\n\n'
      + 'RULES:\n'
      + '- NO filler: "các tiêu đề cho thấy", "đáng chú ý"\n'
      + '- Lead with numbers or named entities where available\n'
      + '- Vietnamese language only\n'
      + '- Only use information from the headlines — no speculation\n'
      + '- Start directly with the summary, no preamble\n\n'
      + 'GOOD: "Thị trường Mỹ tăng mạnh, S&P 500 +1.7% sau số liệu việc làm tháng 6 yếu hơn dự báo. Khả năng Fed cắt lãi suất sớm hơn tăng lên."\n\n'
      + 'Headlines:\n' + headlines;
  } else {
    prompt = 'Bạn là biên tập viên tin tức tài chính. Viết tóm tắt cho mục "' + themeName + '" theo đúng định dạng:\n\n'
      + 'CẤU TRÚC (2 câu, tối đa 40 từ):\n'
      + 'Câu 1: Điều gì xảy ra — nêu cụ thể: số liệu, tên công ty/tổ chức, mức thay đổi.\n'
      + 'Câu 2: Tại sao/Bối cảnh — một nguyên nhân ngắn gọn.\n\n'
      + 'QUY TẮC:\n'
      + '- KHÔNG dùng: "các tiêu đề cho thấy", "thị trường đang", "đáng chú ý", "nhiều diễn biến"\n'
      + '- Bắt đầu TRỰC TIẾP bằng nội dung tóm tắt, không dùng "Vui lòng", không hỏi thêm\n'
      + '- Chỉ dựa vào thông tin trong tiêu đề, không suy đoán\n\n'
      + 'VÍ DỤ TỐT: "PNJ giảm kịch sàn, dư bán 12,5 triệu đơn vị sau vụ khởi tố giám đốc P-Lab. Cổ phiếu chứng khoán nhỏ tăng hơn 14%, dẫn đầu thanh khoản toàn thị trường."\n\n'
      + 'Tiêu đề:\n' + headlines;
  }

  try {
    const res = await fetchWithTimeout(GEMINI_ENDPOINT + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: AI_SUMMARY_MAX_TOKENS, temperature: 0.2 }
      })
    });
    const data    = await res.json();
    // Filter out 'thought' parts (thinking models return both thinking + answer)
    // Take only the actual response parts
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const summary = parts
      .filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('')
      .trim();
    if (!summary) throw new Error('Empty response from Gemini');
    console.log('  \u2713 AI summary for "' + themeName + '": ' + summary.slice(0, 80) + '...');
    return summary;
  } catch (err) {
    console.warn('  \u26a0 Gemini summary for "' + themeName + '": ' + err.message);
    if (err.message.includes('HTTP')) {
      try {
        const errData = await res?.json?.();
        console.warn('  API error details:', JSON.stringify(errData?.error ?? errData).slice(0, 200));
      } catch {}
    }
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await loadEnv();
  console.log('=== VNin1 feed fetch starting ===\n');

  // 1. RSS feeds
  const themeResults = [];
  for (const theme of THEMES) {
    const articles = await fetchTheme(theme);
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
  console.log(`\n=== Done ===`);
  console.log(`Articles: ${total} across ${themeResults.length} themes`);
  console.log(`AI summaries: ${summaryCount}/${themeResults.length}`);
  console.log(`Market open: ${marketOpen}`);
  console.log(`Output: ${outPath}`);

  const noArticles = themeResults.every(t => t.articles.length === 0);
  if (noArticles) process.exitCode = 1;
}

main();
