import YahooFinance from "yahoo-finance2";
import type { MacroChip } from "@/lib/types";

export type RiskHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
  link?: string;
};

export type RiskContext = {
  status: "live" | "pending";
  elevated: boolean;
  flags: string[];
  summary: string;
  headlines: RiskHeadline[];
  note: string;
};

const NOTE =
  "정치·전쟁 뉴스를 상시 수집하지 않습니다. 유가·변동성 등 숫자와 연결된 리스크 헤드라인만 참고합니다. 예측·추천 아님.";

const RSS_QUERIES = [
  "Iran war oil market",
  "Middle East geopolitics oil stocks",
  "Iran oil Hormuz",
];

const GEO_KEYWORDS =
  /iran|israel|gaza|hormuz|middle east|geopolit|war|conflict|missile|strait|oil|crude|중동|이란|이스라엘|전쟁|지정학|호르무즈|유가/i;

function parseMacroPct(changeLabel: string): number | null {
  const m = changeLabel.replace(/,/g, "").match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return Number(m[1]);
}

function buildFlags(macros: MacroChip[]): string[] {
  const flags: string[] = [];
  const wti = macros.find((m) => m.id === "wti");
  const vix = macros.find((m) => m.id === "vix");
  const usdk = macros.find((m) => m.id === "usdkkrw");

  const wtiPct = wti ? parseMacroPct(wti.changeLabel) : null;
  const vixPct = vix ? parseMacroPct(vix.changeLabel) : null;
  const fxPct = usdk ? parseMacroPct(usdk.changeLabel) : null;

  if (wtiPct != null && Math.abs(wtiPct) >= 1.2) {
    flags.push(
      `WTI ${wtiPct >= 0 ? "+" : ""}${wtiPct.toFixed(2)}% — 공급·지정학 리스크가 유가에 반영됐을 수 있음(단정 금지)`,
    );
  }
  if (vixPct != null && Math.abs(vixPct) >= 5) {
    flags.push(
      `VIX ${vixPct >= 0 ? "+" : ""}${vixPct.toFixed(2)}% — 변동성 경계가 커진 구간. 지정학·정책 이벤트가 원인일 수 있음`,
    );
  }
  if (fxPct != null && Math.abs(fxPct) >= 0.6) {
    flags.push(
      `원/달러 ${fxPct >= 0 ? "+" : ""}${fxPct.toFixed(2)}% — 글로벌 리스크·금리 기대와 같이 움직이는 경우가 많음`,
    );
  }
  return flags;
}

function isRecent(iso: string, maxAgeDays = 21): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xml: string): RiskHeadline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out: RiskHeadline[] = [];
  for (const match of items) {
    const block = match[1];
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
    const title = decodeXml(titleRaw).replace(/\s+-\s+[^-]+$/, "").trim();
    if (!title || !GEO_KEYWORDS.test(title)) continue;
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : "";
    if (publishedAt && !isRecent(publishedAt, 21)) continue;
    // title often ends with " - Publisher"
    const publisherMatch = decodeXml(titleRaw).match(/\s-\s(.+)$/);
    out.push({
      title,
      publisher: decodeXml(source) || publisherMatch?.[1]?.trim() || "News",
      publishedAt,
      link,
    });
  }
  return out;
}

async function fetchRssHeadlines(): Promise<RiskHeadline[]> {
  const seen = new Set<string>();
  const out: RiskHeadline[] = [];

  for (const q of RSS_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
          Accept: "application/rss+xml,application/xml,text/xml,*/*",
        },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const xml = await res.text();
      for (const item of parseRssItems(xml)) {
        if (seen.has(item.title)) continue;
        seen.add(item.title);
        out.push(item);
        if (out.length >= 5) return out;
      }
    } catch (error) {
      console.error(`[market] risk rss failed for ${q}`, error);
    }
  }
  return out;
}

async function fetchYahooFallback(): Promise<RiskHeadline[]> {
  try {
    const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const result = await yf.search("Iran oil", { newsCount: 8, quotesCount: 0 });
    return (result.news ?? [])
      .map((item) => {
        const title = item.title?.trim() ?? "";
        const publishedAt =
          item.providerPublishTime instanceof Date
            ? item.providerPublishTime.toISOString()
            : item.providerPublishTime
              ? new Date(item.providerPublishTime as string | number).toISOString()
              : "";
        return {
          title,
          publisher: item.publisher || "Yahoo",
          publishedAt,
          link: item.link,
        } satisfies RiskHeadline;
      })
      .filter((h) => h.title && GEO_KEYWORDS.test(h.title) && (!h.publishedAt || isRecent(h.publishedAt, 21)))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function fetchRiskContext(macros: MacroChip[]): Promise<RiskContext> {
  const flags = buildFlags(macros);
  try {
    let headlines = await fetchRssHeadlines();
    if (headlines.length === 0) headlines = await fetchYahooFallback();

    const elevated = flags.length > 0 || headlines.length > 0;
    const summaryParts = [
      ...flags,
      ...headlines.slice(0, 3).map((h) => `헤드라인: ${h.title} (${h.publisher})`),
    ];
    return {
      status: "live",
      elevated,
      flags,
      summary:
        summaryParts.length > 0
          ? summaryParts.join(" / ")
          : "최근 숫자·헤드라인 기준 두드러진 지정학 리스크 신호 없음",
      headlines,
      note: NOTE,
    };
  } catch (error) {
    console.error("[market] risk context failed", error);
    return {
      status: "pending",
      elevated: flags.length > 0,
      flags,
      summary:
        flags.length > 0
          ? flags.join(" / ")
          : "지정학 리스크 헤드라인을 불러오지 못함",
      headlines: [],
      note: NOTE,
    };
  }
}
