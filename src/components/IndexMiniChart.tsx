"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartPoint, IndexChartSeries } from "@/lib/market/chartTypes";
import {
  INDICATOR_CHART_PERIODS,
  STOCK_CHART_PERIODS,
  defaultPeriodFor,
  formatChartTime,
  type ChartPeriodId,
} from "@/lib/market/chartPeriods";
import { changeToneClass, directionFromChange, formatIndexValue } from "@/lib/format";

/** 주식 차트 클라이언트 폴링 (기존 폴링 없음 → 60초) */
const CHART_POLL_MS = 60_000;

type ChartPayload = {
  points: ChartPoint[];
  periodLabel: string;
  hasVolume: boolean;
  period: ChartPeriodId;
  sessionStartMs?: number;
  sessionEndMs?: number;
};

function buildPricePath(
  points: ChartPoint[],
  width: number,
  height: number,
  padY = 12,
  session?: { startMs: number; endMs: number } | null,
) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usableH = height - padY * 2;
  const useSession =
    Boolean(session) &&
    points.every((p) => typeof p.ms === "number") &&
    (session?.endMs ?? 0) > (session?.startMs ?? 0);
  const spanMs = useSession ? session!.endMs - session!.startMs : 0;

  const coords = points.map((p, i) => {
    let x: number;
    if (useSession && typeof p.ms === "number") {
      const ratio = Math.min(1, Math.max(0, (p.ms - session!.startMs) / spanMs));
      x = ratio * width;
    } else {
      x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
    }
    const y = padY + (1 - (p.v - min) / span) * usableH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
  return { line, area, coords, min, max };
}

function gridLines(height: number, count = 4): number[] {
  const out: number[] = [];
  for (let i = 1; i < count; i += 1) out.push((height / count) * i);
  return out;
}

function cacheKey(
  series: IndexChartSeries,
  period: ChartPeriodId,
): string {
  return `${series.source ?? "yahoo"}:${series.symbol}:${period}:${series.transform ?? "raw"}`;
}

/** Shared across mini-charts so remount / dual panels reuse stubs & in-flight fetches. */
const sharedChartCache = new Map<string, ChartPayload>();
const sharedChartInflight = new Map<string, Promise<ChartPayload | null>>();

async function fetchChartPayload(
  series: IndexChartSeries,
  period: ChartPeriodId,
  periodSet: "stock" | "indicator",
): Promise<ChartPayload | null> {
  const key = cacheKey(series, period);
  const hit = sharedChartCache.get(key);
  if (hit) return hit;

  const pending = sharedChartInflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const params = new URLSearchParams({
      symbol: series.symbol,
      period,
      source: series.source ?? "yahoo",
      transform: series.transform ?? "raw",
      periodSet,
      id: series.id,
      name: series.name,
    });
    try {
      const res = await fetch(`/api/chart?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("chart failed");
      const data = (await res.json()) as {
        points: ChartPoint[];
        periodLabel: string;
        hasVolume: boolean;
        period: ChartPeriodId;
        sessionStartMs?: number;
        sessionEndMs?: number;
      };
      if (!data.points || data.points.length < 1) throw new Error("empty");
      const payload: ChartPayload = {
        points: data.points,
        periodLabel: data.periodLabel,
        hasVolume: Boolean(data.hasVolume),
        period: data.period,
        sessionStartMs: data.sessionStartMs,
        sessionEndMs: data.sessionEndMs,
      };
      sharedChartCache.set(key, payload);
      return payload;
    } catch {
      return null;
    } finally {
      sharedChartInflight.delete(key);
    }
  })();

  sharedChartInflight.set(key, job);
  return job;
}

export function IndexMiniChart({
  seriesList,
  activeId,
  onActiveChange,
  hideSelector = false,
  selectorLabel = "차트 지수",
  quoteChangePercent,
  periodLabel,
  periodSet = "stock",
  defaultPeriod,
}: {
  seriesList: IndexChartSeries[];
  activeId?: string;
  onActiveChange?: (id: string) => void;
  hideSelector?: boolean;
  selectorLabel?: string;
  /** 있으면 표와 같은 당일 등락을 표시 (1일 기간일 때) */
  quoteChangePercent?: number;
  /** 강제 기간 라벨 (드물게 사용) */
  periodLabel?: string;
  periodSet?: "stock" | "indicator";
  defaultPeriod?: ChartPeriodId;
}) {
  const periods = periodSet === "indicator" ? INDICATOR_CHART_PERIODS : STOCK_CHART_PERIODS;
  const initialPeriod = defaultPeriod ?? defaultPeriodFor(periodSet);

  const [internalId, setInternalId] = useState(seriesList[0]?.id ?? "");
  const [period, setPeriod] = useState<ChartPeriodId>(initialPeriod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [live, setLive] = useState<ChartPayload | null>(null);

  const selectedId = activeId ?? internalId;
  const shouldPoll = periodSet === "stock";

  useEffect(() => {
    if (!seriesList.some((s) => s.id === selectedId) && seriesList[0]) {
      const next = seriesList[0].id;
      setInternalId(next);
      onActiveChange?.(next);
    }
  }, [seriesList, selectedId, onActiveChange]);

  const active = seriesList.find((s) => s.id === selectedId) ?? seriesList[0];

  useEffect(() => {
    if (!active?.symbol) return;
    let cancelled = false;
    const key = cacheKey(active, period);

    const applyPayload = (payload: ChartPayload) => {
      sharedChartCache.set(key, payload);
      setLive(payload);
      setError(false);
      setLoading(false);
    };

    const seedIfPossible = () => {
      const canSeed =
        active.points.length >= 2 && (!active.period || active.period === period);
      if (!canSeed) return false;
      applyPayload({
        points: active.points,
        periodLabel:
          active.periodLabel ?? periods.find((p) => p.id === period)?.label ?? "",
        hasVolume: Boolean(active.hasVolume && period === "1d"),
        period,
        sessionStartMs: active.sessionStartMs,
        sessionEndMs: active.sessionEndMs,
      });
      return true;
    };

    const load = async (opts?: { background?: boolean }): Promise<boolean> => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      if (!opts?.background) {
        const cached = sharedChartCache.get(key);
        if (cached) {
          setLive(cached);
          setError(false);
          setLoading(false);
        } else if (!seedIfPossible()) {
          setLive(null);
          setLoading(true);
        }
      }
      // background poll: never flip loading (avoid 60s flicker)
      setError(false);

      const payload = await fetchChartPayload(active, period, periodSet);
      if (cancelled) return false;
      if (!payload) {
        if (!sharedChartCache.get(key)) setError(true);
        setLoading(false);
        return false;
      }
      applyPayload(payload);
      return true;
    };

    let intervalId: number | undefined;

    const stopPoll = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const startPoll = () => {
      if (!shouldPoll || intervalId != null) return;
      intervalId = window.setInterval(() => void load({ background: true }), CHART_POLL_MS);
    };

    void load().then((ok) => {
      if (cancelled || !ok) return;
      if (document.visibilityState !== "hidden") startPoll();
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopPoll();
        return;
      }
      if (!shouldPoll) return;
      void load({ background: true }).then((ok) => {
        if (!cancelled && ok) startPoll();
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // intentionally key off series identity fields, not points array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.symbol, active?.source, active?.transform, period, periodSet, shouldPoll]);


  const points = live?.points ?? active?.points ?? [];
  const showVolume = Boolean(live?.hasVolume && period === "1d");
  const width = 400;
  const priceH = showVolume ? 148 : 188;
  const volH = 52;
  const sessionStartMs =
    period === "1d"
      ? (live?.sessionStartMs ?? active?.sessionStartMs)
      : undefined;
  const sessionEndMs =
    period === "1d"
      ? (live?.sessionEndMs ?? active?.sessionEndMs)
      : undefined;
  const sessionAxis =
    sessionStartMs != null && sessionEndMs != null
      ? { startMs: sessionStartMs, endMs: sessionEndMs }
      : null;

  const path = useMemo(
    () =>
      points.length >= 1
        ? buildPricePath(points, width, priceH, 12, sessionAxis)
        : null,
    [points, priceH, sessionStartMs, sessionEndMs],
  );

  const select = (id: string) => {
    setInternalId(id);
    onActiveChange?.(id);
  };

  if (!active) {
    return <p className="mini-chart__empty">차트 데이터를 불러오지 못했습니다.</p>;
  }

  if ((!path || points.length < 1) && (error || !loading)) {
    return <p className="mini-chart__empty">차트 데이터를 불러오지 못했습니다.</p>;
  }

  const first = points[0]?.v ?? 0;
  const last = points[points.length - 1]?.v ?? 0;
  const periodChangePct = first ? ((last - first) / first) * 100 : 0;
  const useQuoteChg = typeof quoteChangePercent === "number" && period === "1d";
  const displayChangePct = useQuoteChg ? quoteChangePercent : periodChangePct;
  const tone = changeToneClass(directionFromChange(displayChangePct));
  const fillId = `chart-fill-${active.id}-${period}`;
  const changeLabel = useQuoteChg ? "당일" : "기간";
  const subLabel =
    periodLabel ?? live?.periodLabel ?? active.periodLabel ?? periods.find((p) => p.id === period)?.label ?? "";

  const maxVol = showVolume
    ? Math.max(...points.map((p) => p.vol ?? 0), 1)
    : 1;

  const axisStart =
    sessionAxis != null
      ? formatChartTime(sessionAxis.startMs, "1d")
      : points[0]?.t;
  const axisEnd =
    sessionAxis != null
      ? formatChartTime(sessionAxis.endMs, "1d")
      : points[points.length - 1]?.t;

  return (
    <div className={`mini-chart ${loading ? "mini-chart--loading" : ""}`}>
      {!hideSelector ? (
        <div className="mini-chart__toolbar">
          <p className="mini-chart__toolbar-label">{selectorLabel}</p>
          <div className="mini-chart__seg" role="tablist" aria-label={selectorLabel}>
            {seriesList.map((s) => {
              const on = s.id === active.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`mini-chart__seg-btn ${on ? "mini-chart__seg-btn--on" : ""}`}
                  onClick={() => select(s.id)}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mini-chart__meta">
        <div>
          <strong>{active.name}</strong>
          <span className="mini-chart__meta-sub">{subLabel}</span>
        </div>
        <div className={`mini-chart__meta-right ${tone}`}>
          <span className="mini-chart__price">{formatIndexValue(last)}</span>
          <span className="mini-chart__chg">
            {displayChangePct >= 0 ? "+" : ""}
            {displayChangePct.toFixed(2)}% · {changeLabel}
          </span>
        </div>
      </div>

      {path ? (
        <div className="mini-chart__canvas">
          <svg
            className="mini-chart__svg"
            viewBox={`0 0 ${width} ${priceH + (showVolume ? volH + 8 : 0)}`}
            role="img"
            aria-label={`${active.name} ${subLabel} 추이`}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* price pane */}
            <g className={tone}>
              {gridLines(priceH).map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeWidth="1"
                />
              ))}
              <path d={path.area} fill={`url(#${fillId})`} />
              <path
                d={path.line}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={path.coords[path.coords.length - 1].x}
                cy={path.coords[path.coords.length - 1].y}
                r="3.4"
                fill="currentColor"
                stroke="#fff"
                strokeWidth="1.6"
              />
            </g>

            {showVolume ? (
              <g transform={`translate(0, ${priceH + 8})`}>
                <line
                  x1="0"
                  x2={width}
                  y1="0"
                  y2="0"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {path.coords.map((c, i) => {
                  const vol = c.vol ?? 0;
                  const h = Math.max(1, (vol / maxVol) * (volH - 4));
                  const prev = i > 0 ? path.coords[i - 1].v : c.v;
                  const up = c.v >= prev;
                  const barW = Math.max(
                    1.2,
                    sessionAxis
                      ? width / Math.max(78, path.coords.length * 2)
                      : width / points.length - 0.8,
                  );
                  return (
                    <rect
                      key={`${c.t}-${i}`}
                      x={c.x - barW / 2}
                      y={volH - h}
                      width={barW}
                      height={h}
                      className={up ? "text-rise" : "text-fall"}
                      fill="currentColor"
                      opacity="0.45"
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>
        </div>
      ) : (
        <p className="mini-chart__empty">불러오는 중…</p>
      )}

      <div className="mini-chart__axis">
        <span>{axisStart}</span>
        <span>{axisEnd}</span>
      </div>

      <div className="mini-chart__periods" role="tablist" aria-label="차트 기간">
        {periods.map((p) => {
          const on = p.id === period;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={`mini-chart__period ${on ? "mini-chart__period--on" : ""}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="mini-chart__note">
        {showVolume ? "1일 · 가격 + 거래량" : "보조 시각화"} · 예측·매매 신호 아님
      </p>
    </div>
  );
}
