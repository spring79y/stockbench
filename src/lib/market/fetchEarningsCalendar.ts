import "server-only";

import type YahooFinance from "yahoo-finance2";
import {
  EARNINGS_BRIDGE_SYMBOLS,
  type EarningsBridgeSymbol,
} from "@/lib/market/earningsBridge";
import {
  MEGA_CAP_CANDIDATES_KR,
  MEGA_CAP_CANDIDATES_US,
  type MegaCapCandidate,
} from "@/lib/market/retailScan";
import type { EarningsConsensus, MarketEvent, MarketRegion } from "@/lib/types";

type CalendarEarnings = {
  earningsDate?: Date[];
  earningsCallDate?: Date[];
  isEarningsDateEstimate?: boolean;
  earningsAverage?: number;
  earningsLow?: number;
  earningsHigh?: number;
  revenueAverage?: number;
  revenueLow?: number;
  revenueHigh?: number;
};

export type EarningsFetchEntry = {
  symbol: string;
  megaCapId?: string;
  bridgeId?: string;
  name: string;
  region: MarketRegion;
  dateISO: string;
  isEstimate: boolean;
  consensus?: EarningsConsensus;
  actual?: {
    epsActual?: number;
    epsEstimate?: number;
    surprisePct?: number;
    beatLabel?: "서프라이즈" | "미스";
    reportedDateISO?: string;
  };
  sector?: EarningsBridgeSymbol["sector"];
};

function formatEventDateLabel(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} (${get("weekday")})`;
}

function formatRevenue(value: number, region: MarketRegion): string {
  if (region === "KR") {
    if (value >= 1e12) return `약 ${(value / 1e12).toFixed(1)}조원`;
    if (value >= 1e8) return `약 ${Math.round(value / 1e8).toLocaleString()}억원`;
    return `약 ${value.toLocaleString()}원`;
  }
  if (value >= 1e9) return `약 $${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `약 $${Math.round(value / 1e6)}M`;
  return `약 $${value.toLocaleString()}`;
}

function formatEps(value: number, region: MarketRegion): string {
  if (region === "KR") return `약 ${Math.round(value).toLocaleString()}원`;
  return `약 $${value.toFixed(2)}`;
}

function toConsensus(
  raw: CalendarEarnings,
  region: MarketRegion,
): EarningsConsensus | undefined {
  if (raw.earningsAverage == null && raw.revenueAverage == null) return undefined;
  return {
    epsAvg: raw.earningsAverage,
    epsLow: raw.earningsLow,
    epsHigh: raw.earningsHigh,
    epsLabel:
      raw.earningsAverage != null ? formatEps(raw.earningsAverage, region) : undefined,
    revenueAvg: raw.revenueAverage,
    revenueLabel:
      raw.revenueAverage != null ? formatRevenue(raw.revenueAverage, region) : undefined,
    isEstimate: raw.isEarningsDateEstimate ?? true,
  };
}

async function fetchOne(
  yf: InstanceType<typeof YahooFinance>,
  input: {
    symbol: string;
    name: string;
    region: MarketRegion;
    megaCapId?: string;
    bridgeId?: string;
    sector?: EarningsBridgeSymbol["sector"];
  },
): Promise<EarningsFetchEntry | null> {
  try {
    const result = (await yf.quoteSummary(input.symbol, {
      modules: ["calendarEvents", "earnings"],
    })) as {
      calendarEvents?: { earnings?: CalendarEarnings };
      earnings?: {
        earningsChart?: { quarterly?: Array<any> };
      };
    };
    const earnings = result.calendarEvents?.earnings;
    const next = earnings?.earningsDate?.[0];
    if (!next) return null;
    const dateISO = new Date(next).toISOString();

    const now = Date.now();
    const entryTime = new Date(dateISO).getTime();

    // 발표 전에는 실제값이 없을 가능성이 높으므로, 이미 지난 이벤트에 대해서만 매칭 시도
    let actual: EarningsFetchEntry["actual"] | undefined = undefined;
    if (entryTime <= now) {
      const quarterlies = result.earnings?.earningsChart?.quarterly ?? [];
      const reportedWindowMs = 3 * 24 * 60 * 60 * 1000;
      const hit =
        quarterlies.find((q: any) => {
          const rd = q?.reportedDate;
          if (!rd) return false;
          const rt = new Date(rd).getTime();
          if (!Number.isFinite(rt)) return false;
          return Math.abs(rt - entryTime) <= reportedWindowMs;
        }) ?? quarterlies[0];

      if (hit?.actual != null && hit?.estimate != null && hit?.reportedDate) {
        const epsActual = Number(hit.actual);
        const epsEstimate = Number(hit.estimate);
        if (Number.isFinite(epsActual) && Number.isFinite(epsEstimate)) {
          const surprisePct = hit?.surprisePct != null ? Number(hit.surprisePct) : undefined;
          actual = {
            epsActual,
            epsEstimate,
            surprisePct: Number.isFinite(surprisePct as number) ? (surprisePct as number) : undefined,
            beatLabel: epsActual > epsEstimate ? "서프라이즈" : "미스",
            reportedDateISO: new Date(hit.reportedDate).toISOString(),
          };
        }
      }
    }

    return {
      symbol: input.symbol,
      megaCapId: input.megaCapId,
      bridgeId: input.bridgeId,
      name: input.name,
      region: input.region,
      dateISO,
      isEstimate: earnings?.isEarningsDateEstimate ?? true,
      consensus: earnings ? toConsensus(earnings, input.region) : undefined,
      actual,
      sector: input.sector,
    };
  } catch {
    return null;
  }
}

export async function fetchEarningsEntries(
  yf: InstanceType<typeof YahooFinance>,
  horizonDays = 14,
): Promise<EarningsFetchEntry[]> {
  const targets: Array<{
    symbol: string;
    name: string;
    region: MarketRegion;
    megaCapId?: string;
    bridgeId?: string;
    sector?: EarningsBridgeSymbol["sector"];
  }> = [
    ...MEGA_CAP_CANDIDATES_KR.map((c: MegaCapCandidate) => ({
      symbol: c.symbol,
      name: c.name,
      region: "KR" as const,
      megaCapId: c.id,
    })),
    ...MEGA_CAP_CANDIDATES_US.map((c: MegaCapCandidate) => ({
      symbol: c.symbol,
      name: c.name,
      region: "US" as const,
      megaCapId: c.id,
    })),
    ...EARNINGS_BRIDGE_SYMBOLS.map((b) => ({
      symbol: b.symbol,
      name: b.name,
      region: b.region,
      bridgeId: b.id,
      sector: b.sector,
    })),
  ];

  const now = Date.now();
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  const results = await Promise.all(targets.map((t) => fetchOne(yf, t)));
  return results
    .filter((r): r is EarningsFetchEntry => Boolean(r))
    .filter((r) => {
      const t = new Date(r.dateISO).getTime();
      return t >= now - 12 * 60 * 60 * 1000 && t <= now + horizonMs;
    })
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
}

function levelForDate(dateISO: string): MarketEvent["level"] {
  const hours = (new Date(dateISO).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hours <= 72) return "high";
  if (hours <= 168) return "medium";
  return "low";
}

function entryToEvent(entry: EarningsFetchEntry): MarketEvent {
  const id = entry.megaCapId
    ? `earnings-${entry.megaCapId}`
    : `earnings-bridge-${entry.bridgeId ?? entry.symbol.toLowerCase()}`;

  const postLine = entry.actual?.beatLabel
    ? `발표 결과: 컨센서스 대비 ${entry.actual.beatLabel} — 점검용 (매매 신호 아님)`
    : null;

  return {
    id,
    dateLabel: formatEventDateLabel(entry.dateISO),
    region: entry.region,
    title: `${entry.name} 실적 발표`,
    level: levelForDate(entry.dateISO),
    oneLiner:
      postLine ??
      (entry.isEstimate
        ? "시장 컨센서스 대비 실적·가이던스 — 점검용 (매매 신호 아님)"
        : "확정 일정 — 실적·가이던스가 섹터·지수 온도에 미칠 수 있음"),
    kind: "earnings",
    symbol: entry.symbol,
    megaCapId: entry.megaCapId,
    bridgeId: entry.bridgeId,
    dateISO: entry.dateISO,
    sector: entry.sector,
    consensus: entry.consensus,
    actual: entry.actual,
  };
}

function bridgeCompanionEvent(
  bridge: EarningsBridgeSymbol,
  primary: EarningsFetchEntry,
): MarketEvent {
  const krNames = bridge.relatedMegaCapIds
    .map((id) => MEGA_CAP_CANDIDATES_KR.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .slice(0, 2);
  const label = krNames.length > 0 ? krNames.join("·") : "국내 메모리";
  return {
    id: `earnings-bridge-${bridge.id}-kr`,
    dateLabel: formatEventDateLabel(primary.dateISO),
    region: "GLOBAL",
    title: `메모리 섹터 · ${bridge.name} 실적`,
    level: levelForDate(primary.dateISO),
    oneLiner: `${label} 등 연관 시총 맥락 점검 — 종목 추천 아님`,
    kind: "earnings",
    symbol: primary.symbol,
    bridgeId: bridge.id,
    dateISO: primary.dateISO,
    sector: bridge.sector,
    bridgeOf: `earnings-bridge-${bridge.id}`,
    relatedMegaCapIds: [...bridge.relatedMegaCapIds],
    consensus: primary.consensus,
    actual: primary.actual,
  };
}

export function earningsEntriesToEvents(entries: EarningsFetchEntry[]): MarketEvent[] {
  const events: MarketEvent[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const event = entryToEvent(entry);
    if (!seen.has(event.id)) {
      events.push(event);
      seen.add(event.id);
    }

    if (entry.bridgeId) {
      const bridge = EARNINGS_BRIDGE_SYMBOLS.find((b) => b.id === entry.bridgeId);
      if (bridge) {
        const companion = bridgeCompanionEvent(bridge, entry);
        if (!seen.has(companion.id)) {
          events.push(companion);
          seen.add(companion.id);
        }
      }
    }
  }

  return events
    .sort((a, b) => {
      const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return ta - tb;
    })
    .slice(0, 6);
}
