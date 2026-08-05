import { resolveNewsIdentity } from "@/lib/market/retailScan";
import {
  fetchPublisherPublishedAt,
  isWithinMaxAge,
  mergePublisherTime,
  resolveGoogleNewsUrl,
} from "@/lib/market/newsDate";

export type StockNewsItem = {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  publishedLabel: string;
  link?: string;
};

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatNewsWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

function isRecent(iso: string, maxAgeDays = 14): boolean {
  return isWithinMaxAge(iso, maxAgeDays);
}

function parseRssItems(xml: string, maxAgeDays = 14): StockNewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out: StockNewsItem[] = [];
  for (const match of items) {
    const block = match[1];
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
    const decoded = stripTags(decodeXml(titleRaw));
    const publisherMatch = decoded.match(/\s-\s(.+)$/);
    const title = decoded.replace(/\s-\s[^-]+$/, "").trim();
    if (!title || title.length < 8) continue;
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : "";
    if (publishedAt && !isRecent(publishedAt, maxAgeDays)) continue;
    out.push({
      id: `${publishedAt}-${title.slice(0, 40)}`,
      title,
      publisher: stripTags(decodeXml(source)) || publisherMatch?.[1]?.trim() || "뉴스",
      publishedAt,
      publishedLabel: formatNewsWhen(publishedAt) || "최근",
      link: link?.startsWith("http") ? link : undefined,
    });
  }
  return out;
}

async function fetchGoogleNewsKo(queries: string[], maxAgeDays = 7): Promise<StockNewsItem[]> {
  const seen = new Set<string>();
  const bag: StockNewsItem[] = [];

  await Promise.all(
    queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
            Accept: "application/rss+xml,application/xml,text/xml,*/*",
          },
          cache: "no-store",
        });
        if (!res.ok) return;
        const xml = await res.text();
        for (const item of parseRssItems(xml, maxAgeDays)) {
          const key = item.title.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          bag.push(item);
        }
      } catch (error) {
        console.error("[news] rss failed", q, error);
      }
    }),
  );

  bag.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  return bag;
}

/**
 * Google RSS pubDate는 재수집 시각일 수 있음 → 원문 바이라인 날짜로 재검증.
 * 원문일이 maxAge 초과면 제외. 부족해도 개수를 채우지 않음.
 */
async function confirmFreshArticles(
  items: StockNewsItem[],
  maxAgeDays: number,
  limit: number,
): Promise<StockNewsItem[]> {
  const pool = items.slice(0, Math.min(items.length, Math.max(limit * 4, 10)));
  const checked = await Promise.all(
    pool.map(async (item): Promise<StockNewsItem | null> => {
      if (!item.link) return item;

      let publisherUrl = item.link;
      if (publisherUrl.includes("news.google.")) {
        const resolved = await resolveGoogleNewsUrl(publisherUrl);
        if (!resolved) return item;
        publisherUrl = resolved;
      }

      const realAt = await fetchPublisherPublishedAt(publisherUrl);
      if (!realAt) {
        return { ...item, link: publisherUrl };
      }
      if (!isWithinMaxAge(realAt.iso, maxAgeDays)) return null;

      const publishedAt = mergePublisherTime(item.publishedAt, realAt);
      return {
        ...item,
        link: publisherUrl,
        publishedAt,
        publishedLabel: formatNewsWhen(publishedAt) || item.publishedLabel,
        id: `${publishedAt}-${item.title.slice(0, 40)}`,
      };
    }),
  );

  const kept = checked.filter((x): x is StockNewsItem => x != null);
  kept.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  return kept.slice(0, limit);
}

function quoteTerm(term: string): string {
  return /\s/.test(term) || /[()]/.test(term) ? `"${term}"` : term;
}

/** 헤드라인에 종목 표기(언론명·티커)가 실제로 들어있는지 */
export function titleMatchesNewsTerms(title: string, terms: string[]): boolean {
  if (!title || terms.length === 0) return false;
  const hay = title.toLowerCase();
  return terms.some((term) => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return false;
    return hay.includes(needle);
  });
}

const NEWS_MAX_AGE_DAYS = 2;

function buildStockNewsQueries(identity: {
  mediaTerms: string[];
  tickerTerms: string[];
}): string[] {
  const primary = (identity.mediaTerms.length > 0
    ? identity.mediaTerms
    : identity.tickerTerms
  ).slice(0, 5);
  if (primary.length === 0) return [];

  const when = `when:${NEWS_MAX_AGE_DAYS}d`;
  const orGroup = primary.map(quoteTerm).join(" OR ");
  const queries = [`(${orGroup}) (주식 OR 주가 OR 실적 OR 증시 OR 종목) ${when}`];

  const ticker = identity.tickerTerms[0];
  if (ticker) {
    queries.push(`${quoteTerm(ticker)} (주식 OR 주가 OR stock OR earnings) ${when}`);
  }
  if (primary.length >= 2) {
    queries.push(
      `(${primary.slice(0, 2).map(quoteTerm).join(" OR ")}) (주가 OR 실적) ${when}`,
    );
  }
  return queries;
}

/** 종목 관련 최신 헤드라인 (한글) — UI 표시명이 아닌 newsTerms 기준으로 검색·필터 */
export async function fetchStockNews(input: {
  name: string;
  symbol: string;
  region: "KR" | "US";
  id?: string;
  limit?: number;
}): Promise<StockNewsItem[]> {
  const limit = Math.min(5, Math.max(1, input.limit ?? 4));
  const identity = resolveNewsIdentity({
    id: input.id,
    symbol: input.symbol,
    name: input.name,
  });
  if (identity.matchTerms.length === 0) return [];

  const bag = await fetchGoogleNewsKo(buildStockNewsQueries(identity), NEWS_MAX_AGE_DAYS);
  const relevant = bag.filter((item) =>
    titleMatchesNewsTerms(item.title, identity.matchTerms),
  );
  return confirmFreshArticles(relevant, NEWS_MAX_AGE_DAYS, limit);
}

const FLASH_MARKET_RE =
  /증시|주식|코스피|코스닥|나스닥|다우|S&P|주가|환율|금리|연준|FOMC|유가|WTI|원달러|달러|채권|외국인|기관|반도체|실적|인플레이션|CPI|고용|급등|급락|속보|관세|지정학/;

/** 증시개요용 속보 — 시장 영향이 분명한 헤드라인만 (최대 3) */
export async function fetchMarketFlashNews(limit = 3): Promise<StockNewsItem[]> {
  const take = Math.min(3, Math.max(1, limit));
  const when = `when:${NEWS_MAX_AGE_DAYS}d`;
  const queries = [
    `증시 속보 ${when}`,
    `코스피 OR 나스닥 급등 OR 급락 ${when}`,
    `연준 OR 금리 OR 환율 증시 ${when}`,
    `유가 OR WTI 증시 ${when}`,
  ];

  const bag = await fetchGoogleNewsKo(queries, NEWS_MAX_AGE_DAYS);
  const filtered = bag.filter((item) => FLASH_MARKET_RE.test(item.title));
  return confirmFreshArticles(filtered, NEWS_MAX_AGE_DAYS, take);
}
