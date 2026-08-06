import type YahooFinance from "yahoo-finance2";
import { kstCalendarDay } from "@/lib/events/upcomingRetention";
import {
  earningsResultOneLiner,
  isConsensusLikelyRolledForward,
  parseFiniteNumber,
  resolveEarningsBeat,
} from "@/lib/market/earningsBeat";
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

type QuarterlyHit = {
  actual?: unknown;
  estimate?: unknown;
  surprisePct?: unknown;
  reportedDate?: unknown;
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

/** Post-report: consensus must be the same-quarter estimate used for beat — never rolled next-q. */
function toReportedConsensus(
  epsEstimate: number,
  region: MarketRegion,
): EarningsConsensus {
  return {
    epsAvg: epsEstimate,
    epsLabel: formatEps(epsEstimate, region),
    isEstimate: false,
  };
}

function matchQuarterlyForReport(
  quarterlies: QuarterlyHit[],
  entryTime: number,
): QuarterlyHit | undefined {
  const reportedWindowMs = 3 * 24 * 60 * 60 * 1000;
  // Never fall back to quarterlies[0] — wrong quarter silently flips beat/miss.
  return quarterlies.find((q) => {
    const rd = q?.reportedDate;
    if (!rd) return false;
    const rt = new Date(rd as string | Date).getTime();
    if (!Number.isFinite(rt)) return false;
    return Math.abs(rt - entryTime) <= reportedWindowMs;
  });
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
        earningsChart?: {
          quarterly?: QuarterlyHit[];
          currentQuarterEstimate?: number;
        };
      };
    };
    const earnings = result.calendarEvents?.earnings;
    const next = earnings?.earningsDate?.[0];
    if (!next) return null;
    const dateISO = new Date(next).toISOString();

    const now = Date.now();
    const entryTime = new Date(dateISO).getTime();
    const currentQuarterEstimate = parseFiniteNumber(
      result.earnings?.earningsChart?.currentQuarterEstimate,
    );

    let actual: EarningsFetchEntry["actual"] | undefined = undefined;
    let consensus: EarningsConsensus | undefined = earnings
      ? toConsensus(earnings, input.region)
      : undefined;

    if (entryTime <= now) {
      const quarterlies = result.earnings?.earningsChart?.quarterly ?? [];
      const hit = matchQuarterlyForReport(quarterlies, entryTime);

      if (hit?.actual != null && hit?.estimate != null && hit?.reportedDate) {
        const epsActual = parseFiniteNumber(hit.actual);
        const epsEstimate = parseFiniteNumber(hit.estimate);
        if (epsActual != null && epsEstimate != null) {
          const yahooSurprisePct = parseFiniteNumber(hit.surprisePct);
          const calendarEps = parseFiniteNumber(earnings?.earningsAverage);
          const rolled = isConsensusLikelyRolledForward({
            calendarEpsAvg: calendarEps,
            currentQuarterEstimate,
            reportedQuarterEstimate: epsEstimate,
          });
          // Dual-source: only same-quarter calendar may confirm polarity.
          // Rolled next-q calendar → thin Yahoo path → omit 서프라이즈/미스.
          const altEstimate = rolled ? undefined : calendarEps;

          const resolved = resolveEarningsBeat({
            epsActual,
            epsEstimate,
            yahooSurprisePct,
            altEstimate,
          });

          actual = {
            epsActual,
            epsEstimate,
            // surprisePct only when beatLabel set — avoid implying polarity alone
            surprisePct: resolved.beatLabel ? resolved.surprisePct : undefined,
            beatLabel: resolved.beatLabel,
            reportedDateISO: new Date(hit.reportedDate as string | Date).toISOString(),
          };

          // Replace rolled-forward calendar consensus with the estimate we compared.
          consensus = toReportedConsensus(epsEstimate, input.region);
        }
      } else if (consensus && currentQuarterEstimate != null) {
        // Past date but no matched print: drop consensus if it already looks like next quarter.
        const calendarEps = parseFiniteNumber(earnings?.earningsAverage);
        if (
          isConsensusLikelyRolledForward({
            calendarEpsAvg: calendarEps,
            currentQuarterEstimate,
            reportedQuarterEstimate: null,
          })
        ) {
          consensus = undefined;
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
      consensus,
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
  const todayKst = kstCalendarDay(new Date(now));
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  const results = await Promise.all(targets.map((t) => fetchOne(yf, t)));
  return results
    .filter((r): r is EarningsFetchEntry => Boolean(r))
    .filter((r) => {
      const t = new Date(r.dateISO).getTime();
      // Keep same KST calendar day (even if clock already passed) until next KST day.
      const day = kstCalendarDay(new Date(r.dateISO));
      return day >= todayKst && t <= now + horizonMs;
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

  const hasActualNumbers =
    entry.actual?.epsActual != null && entry.actual?.epsEstimate != null;
  const postLine = hasActualNumbers
    ? earningsResultOneLiner(entry.actual?.beatLabel, {
        epsActual: entry.actual?.epsActual,
        epsEstimate: entry.actual?.epsEstimate,
        region: entry.region,
      })
    : null;

  const related =
    entry.bridgeId != null
      ? EARNINGS_BRIDGE_SYMBOLS.find((b) => b.id === entry.bridgeId)?.relatedMegaCapIds
      : undefined;

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
    relatedMegaCapIds: related ? [...related] : undefined,
    consensus: entry.consensus,
    actual: entry.actual,
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
  }

  return events
    .sort((a, b) => {
      const ta = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const tb = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return ta - tb;
    })
    .slice(0, 6);
}
