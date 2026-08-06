/**
 * Collector path: attach free Google News RSS headlines to imminent earnings.
 * Structured Evidence only (title/publisher/time/snippet) — no article dump.
 * LLM may summarize guidance/reaction only when these items exist.
 */
import {
  titleMatchesNewsTerms,
  type StockNewsItem,
} from "@/lib/market/fetchStockNews";
import { resolveNewsIdentity } from "@/lib/market/retailScan";
import type { EarningsContextNewsItem, MarketEvent } from "@/lib/types";

const CONTEXT_MAX_AGE_DAYS = 3;
const CONTEXT_LIMIT = 3;

const EARNINGS_TOPIC_RE =
  /실적|어닝|가이던스|전망|earnings|guidance|outlook|eps|revenue|results|beat|miss|profit|forecast/i;

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

function isRecent(iso: string, maxAgeDays: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function parseRssItems(xml: string, maxAgeDays: number): StockNewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out: StockNewsItem[] = [];
  for (const match of items) {
    const block = match[1];
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
    const decoded = stripTags(decodeXml(titleRaw));
    const publisherMatch = decoded.match(/\s[-–—]\s(.+)$/);
    let title = decoded.replace(/\s[-–—]\s[^-–—]+$/, "").trim();
    if (!title || title.length < 8) continue;
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : "";
    if (publishedAt && !isRecent(publishedAt, maxAgeDays)) continue;
    const publisher =
      stripTags(decodeXml(source)) || publisherMatch?.[1]?.trim() || "뉴스";
    // Drop accidental publisher echo left in title
    if (publisher.length >= 3 && title.toLowerCase().endsWith(publisher.toLowerCase())) {
      title = title.slice(0, -publisher.length).replace(/[\s\-–—]+$/, "").trim();
    }
    out.push({
      id: `${publishedAt}-${title.slice(0, 40)}`,
      title,
      publisher,
      publishedAt,
      publishedLabel: publishedAt ? publishedAt.slice(0, 10) : "최근",
      link: link?.startsWith("http") ? link : undefined,
    });
  }
  return out;
}

type NewsLocale = { hl: string; gl: string; ceid: string };

async function fetchGoogleNewsRss(
  queries: string[],
  locale: NewsLocale,
  maxAgeDays: number,
): Promise<StockNewsItem[]> {
  const seen = new Set<string>();
  const bag: StockNewsItem[] = [];

  await Promise.all(
    queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;
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
        console.error("[earnings-context-news] rss failed", q, error);
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

function quoteTerm(term: string): string {
  return /\s/.test(term) || /[()]/.test(term) ? `"${term}"` : term;
}

function buildContextQueries(identity: {
  mediaTerms: string[];
  tickerTerms: string[];
}): { ko: string[]; en: string[] } {
  const primary = (identity.mediaTerms.length > 0
    ? identity.mediaTerms
    : identity.tickerTerms
  ).slice(0, 4);
  if (primary.length === 0) return { ko: [], en: [] };

  const when = `when:${CONTEXT_MAX_AGE_DAYS}d`;
  const orGroup = primary.map(quoteTerm).join(" OR ");
  const ticker = identity.tickerTerms[0];

  const ko = [
    `(${orGroup}) (실적 OR 가이던스 OR 어닝 OR 주가) ${when}`,
  ];
  if (ticker) ko.push(`${quoteTerm(ticker)} (실적 OR earnings OR guidance) ${when}`);

  const en = [
    `(${orGroup}) (earnings OR guidance OR outlook OR EPS) ${when}`,
  ];
  if (ticker) en.push(`${quoteTerm(ticker)} (earnings OR guidance) ${when}`);

  return { ko, en };
}

function toContextItem(item: StockNewsItem): EarningsContextNewsItem {
  const snippet =
    item.title.length > 120 ? `${item.title.slice(0, 117)}…` : item.title;
  return {
    title: item.title,
    publisher: item.publisher,
    publishedAt: item.publishedAt || new Date().toISOString(),
    snippet,
  };
}

/** Prefer earnings/guidance headlines; fall back to company-matched titles. */
function rankContextItems(
  items: StockNewsItem[],
  matchTerms: string[],
  limit: number,
): EarningsContextNewsItem[] {
  const relevant = items.filter((item) =>
    titleMatchesNewsTerms(item.title, matchTerms),
  );
  const topical = relevant.filter((item) => EARNINGS_TOPIC_RE.test(item.title));
  const pool = topical.length > 0 ? topical : relevant;
  return pool.slice(0, limit).map(toContextItem);
}

export function isEarningsContextNewsWindow(
  event: Pick<MarketEvent, "kind" | "dateISO" | "actual">,
  now: Date = new Date(),
): boolean {
  if (event.kind !== "earnings" || !event.dateISO) return false;
  const hours = (new Date(event.dateISO).getTime() - now.getTime()) / (60 * 60 * 1000);
  const isPre = hours >= 0 && hours <= 48;
  const hasNumbers =
    event.actual?.epsActual != null && event.actual?.epsEstimate != null;
  const isPost =
    hours < 0 &&
    hours >= -36 &&
    (Boolean(event.actual?.beatLabel) || hasNumbers);
  return isPre || isPost;
}

export async function fetchEarningsContextNewsForEvent(
  event: MarketEvent,
): Promise<EarningsContextNewsItem[]> {
  if (!event.symbol) return [];
  const name = event.title.replace(/\s*실적\s*발표$/, "").trim() || event.symbol;
  const identity = resolveNewsIdentity({
    id: event.bridgeId ?? event.megaCapId,
    symbol: event.symbol,
    name,
  });
  if (identity.matchTerms.length === 0) return [];

  const queries = buildContextQueries(identity);
  const locales: Array<{ queries: string[]; locale: NewsLocale }> = [
    { queries: queries.ko, locale: { hl: "ko", gl: "KR", ceid: "KR:ko" } },
  ];
  if (event.region === "US" || event.region === "GLOBAL") {
    locales.push({
      queries: queries.en,
      locale: { hl: "en-US", gl: "US", ceid: "US:en" },
    });
  }

  const bags = await Promise.all(
    locales.map(({ queries: qs, locale }) =>
      qs.length > 0
        ? fetchGoogleNewsRss(qs, locale, CONTEXT_MAX_AGE_DAYS)
        : Promise.resolve([] as StockNewsItem[]),
    ),
  );
  const seen = new Set<string>();
  const merged: StockNewsItem[] = [];
  for (const bag of bags) {
    for (const item of bag) {
      const key = item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });

  return rankContextItems(merged, identity.matchTerms, CONTEXT_LIMIT);
}

/** Attach context news to imminent earnings events (Collector). Failures → omit. */
export async function attachEarningsContextNews(
  events: MarketEvent[],
  now: Date = new Date(),
): Promise<MarketEvent[]> {
  const targets = events.filter((e) => isEarningsContextNewsWindow(e, now));
  if (targets.length === 0) return events;

  const byId = new Map<string, EarningsContextNewsItem[]>();
  await Promise.all(
    targets.map(async (ev) => {
      try {
        const items = await fetchEarningsContextNewsForEvent(ev);
        if (items.length > 0) byId.set(ev.id, items);
      } catch (error) {
        console.error("[earnings-context-news] attach failed", ev.id, error);
      }
    }),
  );

  if (byId.size === 0) return events;
  return events.map((e) => {
    const news = byId.get(e.id);
    return news ? { ...e, contextNews: news } : e;
  });
}
