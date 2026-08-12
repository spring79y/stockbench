import type { MarketEvent } from "@/lib/types";
import {
  isClearlyPostResultOneLiner,
  isEventPastAnnounce,
} from "@/lib/events/upcomingRetention";

type FredPrint = { symbol: string; transform: "yoy" | "mom" | "raw"; label: string };

/** Known macro ids → FRED series used for post-announce fact lines (never invent). */
const MACRO_FRED_PRINT: Record<string, FredPrint[]> = {
  cpi: [
    { symbol: "CPIAUCSL", transform: "yoy", label: "CPI 전년비" },
    { symbol: "CPILFESL", transform: "yoy", label: "근원 CPI 전년비" },
  ],
  nfp: [{ symbol: "PAYEMS", transform: "mom", label: "비농업 고용 전월" }],
};

async function fetchFredCsv(
  seriesId: string,
): Promise<Array<{ date: string; value: number }>> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; StockLabBriefing/0.1; +https://localhost)",
        Accept: "text/csv,*/*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const text = await res.text();
    const rows: Array<{ date: string; value: number }> = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("DATE") || trimmed.startsWith("observation")) {
        continue;
      }
      const [date, raw] = trimmed.split(",");
      if (!date || raw == null || raw === "." || raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      rows.push({ date, value });
    }
    return rows;
  } catch {
    return [];
  }
}

function applyTransform(
  rows: Array<{ date: string; value: number }>,
  transform: "raw" | "mom" | "yoy",
): Array<{ date: string; value: number }> {
  if (transform === "raw") return rows;
  if (transform === "mom") {
    const out: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < rows.length; i += 1) {
      out.push({
        date: rows[i].date,
        value: Number((rows[i].value - rows[i - 1].value).toFixed(2)),
      });
    }
    return out;
  }
  const byDate = new Map(rows.map((r) => [r.date, r.value]));
  const out: Array<{ date: string; value: number }> = [];
  for (const row of rows) {
    const d = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    const prevKey = d.toISOString().slice(0, 10);
    const prev = byDate.get(prevKey) ?? byDate.get(`${prevKey.slice(0, 8)}01`);
    if (prev == null || prev === 0) continue;
    out.push({
      date: row.date,
      value: Number((((row.value - prev) / prev) * 100).toFixed(2)),
    });
  }
  return out;
}

async function latestFredPrint(def: FredPrint): Promise<string | null> {
  const rows = applyTransform(await fetchFredCsv(def.symbol), def.transform);
  const last = rows[rows.length - 1];
  if (!last || !Number.isFinite(last.value)) return null;
  if (def.transform === "yoy") {
    return `${def.label} ${last.value.toFixed(1)}%`;
  }
  if (def.transform === "mom" && def.symbol === "PAYEMS") {
    // PAYEMS mom is thousands of persons
    const signed = last.value >= 0 ? `+${Math.round(last.value)}` : `${Math.round(last.value)}`;
    return `${def.label} ${signed}천 명`;
  }
  return `${def.label} ${last.value}`;
}

/**
 * After announce (D-day / D-day+1 retention), attach a fact oneLiner from FRED
 * when we do not already have a post-result line. Never invent numbers.
 */
export async function enrichMacroPostPrint(
  events: MarketEvent[],
  now: Date = new Date(),
): Promise<MarketEvent[]> {
  return Promise.all(
    events.map(async (event) => {
      if (event.kind === "earnings") return event;
      if (!isEventPastAnnounce(event, now)) return event;
      if (isClearlyPostResultOneLiner(event.oneLiner)) return event;

      const defs = MACRO_FRED_PRINT[event.id];
      if (!defs?.length) {
        return {
          ...event,
          oneLiner: "발표됨 · 결과 집계 대기",
        };
      }

      const parts: string[] = [];
      for (const def of defs) {
        const piece = await latestFredPrint(def);
        if (piece) parts.push(piece);
      }
      if (parts.length === 0) {
        return {
          ...event,
          oneLiner: "발표됨 · 결과 집계 대기",
        };
      }
      return {
        ...event,
        oneLiner: `발표됨 · ${parts.join(" · ")}`,
      };
    }),
  );
}
