"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartPoint, IndexChartSeries } from "@/lib/market/chartTypes";
import {
  INDICATOR_CHART_PERIODS,
  STOCK_CHART_PERIODS,
  defaultPeriodFor,
  type ChartPeriodId,
} from "@/lib/market/chartPeriods";
import { changeToneClass, directionFromChange, formatIndexValue } from "@/lib/format";

type ChartPayload = {
  points: ChartPoint[];
  periodLabel: string;
  hasVolume: boolean;
  period: ChartPeriodId;
};

function buildPricePath(
  points: ChartPoint[],
  width: number,
  height: number,
  padY = 12,
) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usableH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
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
  const cacheRef = useRef<Map<string, ChartPayload>>(new Map());

  const selectedId = activeId ?? internalId;

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
    const cached = cacheRef.current.get(key);

    if (cached) {
      setLive(cached);
      setError(false);
      setLoading(false);
      return;
    }

    const canSeed =
      active.points.length >= 2 && (!active.period || active.period === period);

    if (canSeed) {
      const seed: ChartPayload = {
        points: active.points,
        periodLabel:
          active.periodLabel ?? periods.find((p) => p.id === period)?.label ?? "",
        hasVolume: Boolean(active.hasVolume && period === "1d"),
        period,
      };
      cacheRef.current.set(key, seed);
      setLive(seed);
      setError(false);
      setLoading(false);
      return;
    }

    setLive(null);

    const params = new URLSearchParams({
      symbol: active.symbol,
      period,
      source: active.source ?? "yahoo",
      transform: active.transform ?? "raw",
      periodSet,
      id: active.id,
      name: active.name,
    });

    setLoading(true);
    setError(false);

    fetch(`/api/chart?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("chart failed");
        return res.json() as Promise<{
          points: ChartPoint[];
          periodLabel: string;
          hasVolume: boolean;
          period: ChartPeriodId;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.points || data.points.length < 2) throw new Error("empty");
        const payload: ChartPayload = {
          points: data.points,
          periodLabel: data.periodLabel,
          hasVolume: Boolean(data.hasVolume),
          period: data.period,
        };
        cacheRef.current.set(key, payload);
        setLive(payload);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // intentionally key off series identity fields, not points array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.symbol, active?.source, active?.transform, period, periodSet]);


  const points = live?.points ?? active?.points ?? [];
  const showVolume = Boolean(live?.hasVolume && period === "1d");
  const width = 400;
  const priceH = showVolume ? 148 : 188;
  const volH = 52;
  const path = useMemo(
    () => (points.length >= 2 ? buildPricePath(points, width, priceH) : null),
    [points, priceH],
  );

  const select = (id: string) => {
    setInternalId(id);
    onActiveChange?.(id);
  };

  if (!active) {
    return <p className="mini-chart__empty">차트 데이터를 불러오지 못했습니다.</p>;
  }

  if ((!path || points.length < 2) && (error || !loading)) {
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
                {points.map((p, i) => {
                  const x =
                    points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
                  const vol = p.vol ?? 0;
                  const h = Math.max(1, (vol / maxVol) * (volH - 4));
                  const prev = i > 0 ? points[i - 1].v : p.v;
                  const up = p.v >= prev;
                  const barW = Math.max(1.2, width / points.length - 0.8);
                  return (
                    <rect
                      key={`${p.t}-${i}`}
                      x={x - barW / 2}
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
        <span>{points[0]?.t}</span>
        <span>{points[points.length - 1]?.t}</span>
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
