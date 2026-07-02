// scripts/fetch-feeds.mjs
//
// Single script that does everything in one hourly run:
//   1. Fetches all RSS feeds grouped by theme
//   2. Fetches VN market index data (VNDirect) + USD/VND (Vietcombank)
//   3. Calls Gemini to generate a Vietnamese AI summary per theme
//   4. Writes everything to src/data/feed.json
//
// Run manually:  npm run fetch
// Scheduled:     see .github/workflows/update-feed.yml (runs hourly)
//
// CONTENT POLICY — enforced here, never bypass:
//   Only title + RSS-provided excerpt (~160 chars) + link per article.
//   Full article bodies are never fetched, stored, or displayed.
//   Every article carries sourceId + sourceName + sourceUrl for attribution.
//   AI summaries are based only on headlines — no speculation, no invention.

import { XMLParser } from 'fast-xml-parser';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITEMS_PER_FEED   = 3;   // articles per source per theme
const EXCERPT_LENGTH       = 160;  // max chars for excerpt
const FETCH_TIMEOUT_MS     = 15000;
const AI_SUMMARY_MAX_TOKENS = 120;

// ─── Config ───────────────────────────────────────────────────────────────────
// ALL sources, themes, and endpoints live here.
// To add a source: add feed entries to each theme below.
// To add a theme: add a new object to THEMES.
// To change section order: reorder the THEMES array.
// Nothing else in the codebase needs to change.

const THEMES = [
  {
    key: 'stocks',
    displayName: 'Chứng khoán',
    feeds: [
      {
        sourceId: 'cafef',
        sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn',
        attribution: 'CafeF',
        candidateUrls: [
          'https://cafef.vn/thi-truong-chung-khoan.rss',
          'https://cafef.vn/chung-khoan.rss'
        ]
      },
      {
        sourceId: 'vneconomy',
        sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn',
        attribution: 'VnEconomy',
        candidateUrls: [
          'https://vneconomy.vn/chung-khoan.rss'
        ]
      }
    ]
  },
  {
    key: 'realestate',
    displayName: 'Bất động sản',
    feeds: [
      {
        sourceId: 'cafef',
        sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn',
        attribution: 'CafeF',
        candidateUrls: [
          'https://cafef.vn/bat-dong-san.rss'
        ]
      },
      {
        sourceId: 'vneconomy',
        sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn',
        attribution: 'VnEconomy',
        candidateUrls: [
          'https://vneconomy.vn/dia-oc.rss'
        ]
      }
    ]
  },
  {
    key: 'macro',
    displayName: 'Vĩ mô / Đầu tư',
    feeds: [
      {
        sourceId: 'cafef',
        sourceName: 'CafeF',
        sourceUrl: 'https://cafef.vn',
        attribution: 'CafeF',
        candidateUrls: [
          'https://cafef.vn/vi-mo-dau-tu.rss'
        ]
      },
      {
        sourceId: 'vneconomy',
        sourceName: 'VnEconomy',
        sourceUrl: 'https://vneconomy.vn',
        attribution: 'VnEconomy',
        // dau-tu.rss is primary; tieu-diem.rss is fallback — resolve which is
        // better in Phase 5 once live data is visible (open item in PLANNING.md)
        candidateUrls: [
          'https://vneconomy.vn/dau-tu.rss',
          'https://vneconomy.vn/tieu-diem.rss'
        ]
      }
    ]
  }
];

// Market data — candidateUrls tried in order, first success wins.
// If VNDirect changes their API, add the new URL at the front of the array.
const MARKET_CONFIG = {
  indices: {
    candidateUrls: [
      'https://finfo-api.vndirect.com.vn/v4/stock_prices/?q=code:VNINDEX,HNXINDEX&sort=date&size=2&page=1&fields=code,close,change,percentChange,totalMatchVolume',
      'https://finfo-api.vndirect.com.vn/v4/stock_prices/?q=code:VNINDEX&sort=date&size=1&page=1&fields=code,close,change,percentChange,totalMatchVolume'
    ]
  },
  usdvnd: {
    candidateUrls: [
      'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10'
    ]
  },
  goldVnd: {
    candidateUrls: [
      'https://sjc.com.vn/xml/tygiavang.xml'
    ]
  },
  goldUsd: {
    candidateUrls: [
      'https://data-asg.goldprice.org/dbXRates/USD'
    ]
  }
};

// Gemini — swap provider here if needed. Keep the interface the same:
// generateSummary(headlines: string[]) => Promise<string|null>
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadEnv() {
  // Reads .env file if present (local dev). In GitHub Actions, secrets are
  // injected directly as environment variables — no .env file needed there.
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
  } catch {
    // No .env file — fine in CI, expected in production
  }
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
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
  let lastError;
  for (const url of feed.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url);
      const xml  = await res.text();
      const parsed = xmlParser.parse(xml);
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
          return {
            title, link, pubDate, excerpt,
            sourceId:   feed.sourceId,
            sourceName: feed.sourceName,
            sourceUrl:  feed.sourceUrl,
            attribution: feed.attribution
          };
        })
        .filter(a => a.title && a.link);

      console.log(`  ✓ ${feed.sourceName} [${url.split('/').pop()}]: ${articles.length} articles`);
      return articles;
    } catch (err) {
      lastError = err;
      console.warn(`  ⚠ ${feed.sourceName}: ${url} — ${err.message}`);
    }
  }
  console.error(`  ✗ ${feed.sourceName}: all URLs failed`);
  return [];
}

async function fetchTheme(theme) {
  console.log(`\nFetching theme: ${theme.displayName}`);
  const allArticles = (await Promise.all(theme.feeds.map(fetchOneFeed))).flat();

  // Sort all articles from all sources newest-first
  allArticles.sort((a, b) => {
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });

  return allArticles;
}

// ─── Market data ──────────────────────────────────────────────────────────────

function isMarketOpen() {
  const now = new Date();
  // Convert to Vietnam time (UTC+7)
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const day  = vnTime.getDay();   // 0=Sun, 6=Sat
  const hour = vnTime.getHours();
  const min  = vnTime.getMinutes();
  const timeNum = hour * 100 + min;
  return day >= 1 && day <= 5 && timeNum >= 900 && timeNum < 1500;
}

async function fetchMarketIndices() {
  for (const url of MARKET_CONFIG.indices.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url);
      const data = await res.json();
      const items = data?.data ?? [];

      const vnIndex  = items.find(i => i.code === 'VNINDEX');
      const hnxIndex = items.find(i => i.code === 'HNXINDEX');

      if (!vnIndex && !hnxIndex) throw new Error('No index data in response');

      console.log(`  ✓ Market indices from VNDirect`);
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
      const res  = await fetchWithTimeout(url);
      const xml  = await res.text();
      const parsed = xmlParser.parse(xml);

      // Vietcombank XML: ExrateList > Exrate[@CurrencyCode="USD"]
      const exrates = parsed?.ExrateList?.Exrate ?? [];
      const list = Array.isArray(exrates) ? exrates : [exrates];
      const usd = list.find(e => e['@_CurrencyCode'] === 'USD');

      if (!usd) throw new Error('USD rate not found in XML');

      // Sell rate is the reference rate most sites display
      const sell = parseFloat(String(usd['@_Sell']).replace(',', ''));
      console.log(`  ✓ USD/VND from Vietcombank: ${sell}`);
      return { value: sell, source: 'Vietcombank' };
    } catch (err) {
      console.warn(`  ⚠ USD/VND: ${url} — ${err.message}`);
    }
  }
  console.error('  ✗ USD/VND: all sources failed');
  return null;
}

// ─── AI summaries (Gemini) ────────────────────────────────────────────────────

async function generateSummary(themeName, articles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('  ⚠ GEMINI_API_KEY not set — skipping AI summary');
    return null;
  }
  if (articles.length === 0) return null;

  const headlines = articles
    .slice(0, 12)
    .map((a, i) => `${i + 1}. ${a.title}`)
    .join('\n');

  const prompt = `Viết 1-2 câu theo phong cách Bloomberg/Reuters bằng tiếng Việt về chủ đề "${themeName}".
Ngắn gọn, súc tích, nêu bật con số và diễn biến cụ thể. Không dùng gạch đầu dòng.
Chỉ dựa vào các tiêu đề sau — không suy đoán:
${headlines}`;

  try {
    const res = await fetchWithTimeout(
      `${GEMINI_ENDPOINT}?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: AI_SUMMARY_MAX_TOKENS, temperature: 0.3 }
        })
      }
    );
    const data = await res.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary) throw new Error('Empty response from Gemini');
    console.log(`  ✓ AI summary for "${themeName}": ${summary.slice(0, 60)}…`);
    return summary;
  } catch (err) {
    console.warn(`  ⚠ Gemini summary for "${themeName}": ${err.message}`);
    return null;
  }
}

// ─── Gold prices ──────────────────────────────────────────────────────────────

async function fetchGoldVnd() {
  for (const url of MARKET_CONFIG.goldVnd.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url);
      const xml  = await res.text();
      const parsed = xmlParser.parse(xml);

      // SJC XML: look for SJC 1L row, take sell price (in thousands VND)
      const cities = parsed?.root?.city ?? parsed?.giatot?.city ?? [];
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
              // Values > 100000 are already full VND, smaller values are in thousands
              sell = val > 100000 ? val : val * 1000;
              break;
            }
          }
        }
        if (sell) break;
      }
      if (!sell) throw new Error('SJC sell price not parsed');
      console.log(`  ✓ Gold VND (SJC): ${sell.toLocaleString()}`);
      return { value: sell, unit: 'VND/lượng', source: 'SJC' };
    } catch (err) {
      console.warn(`  ⚠ Gold VND: ${url} — ${err.message}`);
    }
  }
  console.error('  ✗ Gold VND: all sources failed');
  return null;
}

async function fetchGoldUsd() {
  for (const url of MARKET_CONFIG.goldUsd.candidateUrls) {
    try {
      const res  = await fetchWithTimeout(url);
      const data = await res.json();
      // goldprice.org format: { items: [{ curr: 'USD', xauPrice: 3350.25 }] }
      const item = data?.items?.find(i => i.curr === 'USD');
      const price = item?.xauPrice ?? data?.price ?? data?.USD?.price;
      if (!price) throw new Error('Gold USD price not found in response');
      const rounded = Math.round(price * 100) / 100;
      console.log(`  ✓ Gold USD: $${rounded}`);
      return { value: rounded, unit: 'USD/oz', source: 'goldprice.org' };
    } catch (err) {
      console.warn(`  ⚠ Gold USD: ${url} — ${err.message}`);
    }
  }
  console.error('  ✗ Gold USD: all sources failed');
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await loadEnv();

  console.log('=== VNin1 feed fetch starting ===\n');

  // 1. Fetch all RSS feeds by theme
  const themeResults = [];
  for (const theme of THEMES) {
    const articles = await fetchTheme(theme);
    themeResults.push({ key: theme.key, displayName: theme.displayName, articles });
  }

  // 2. Fetch market data
  console.log('\nFetching market data...');
  const [indices, usdvnd, goldVnd, goldUsd] = await Promise.all([
    fetchMarketIndices(), fetchUsdVnd(), fetchGoldVnd(), fetchGoldUsd()
  ]);
  const marketOpen = isMarketOpen();

  // 3. Generate AI summaries (sequential to be safe with rate limits)
  console.log('\nGenerating AI summaries...');
  for (const theme of themeResults) {
    theme.aiSummary = await generateSummary(theme.displayName, theme.articles);
  }

  // 4. Build output
  const output = {
    lastUpdated: new Date().toISOString(),
    market: {
      vnIndex:   indices.vnIndex,
      hnxIndex:  indices.hnxIndex,
      usdVnd:    usdvnd,
      goldVnd,
      goldUsd,
      marketOpen,
      note: marketOpen ? null : 'Thị trường đóng cửa — hiển thị giá đóng cửa gần nhất'
    },
    themes: themeResults
  };

  // 5. Write feed.json
  const outPath = path.resolve('src/data/feed.json');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');

  const total = themeResults.reduce((sum, t) => sum + t.articles.length, 0);
  const summaryCount = themeResults.filter(t => t.aiSummary).length;
  console.log(`\n=== Done ===`);
  console.log(`Articles: ${total} across ${themeResults.length} themes`);
  console.log(`AI summaries: ${summaryCount}/${themeResults.length}`);
  console.log(`Market open: ${marketOpen}`);
  console.log(`Output: ${outPath}`);

  // Fail the build only if everything failed — one broken source is OK
  const noArticles = themeResults.every(t => t.articles.length === 0);
  if (noArticles) {
    console.error('\n✗ No articles fetched from any source. Check network and feed URLs.');
    process.exitCode = 1;
  }
}

main();
