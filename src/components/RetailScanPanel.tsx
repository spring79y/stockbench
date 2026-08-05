"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { changeToneClass, directionFromChange, formatIndexValue, formatSigned } from "@/lib/format";
import { formatFlowShares } from "@/lib/market/flowFormat";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import type { MarketScope } from "@/lib/market/scope";
import type { FlowLeg, MegaCapQuote, RetailScanBundle } from "@/lib/market/retailScan";
import type { Ks200NightFuturesQuote } from "@/lib/market/fetchKs200NightFutures";

const NIGHT_POLL_MS = 60_000;

const IndexMiniChart = dynamic(
  () => import("@/components/IndexMiniChart").then((m) => m.IndexMiniChart),
  { loading: () => <p className="mini-chart__empty">불러오는 중…</p> },
);

const SIGNAL_TIPS: Record<string, string> = {
  "ks200-vs-kospi": "코스피200과 코스피 등락 차이. 대형주 온도를 가늠하는 참고.",
  "vix-temp": "미국 변동성 지수. 숫자가 커질수록 시장이 더 불안해 보일 수 있음.",
  "top5-kr-avg": "국내 시총 큰 종목들의 평균 등락. 시장 체감 온도.",
  "top5-us-avg": "미국 시총 큰 종목들의 평균 등락. 시장 체감 온도.",
};

function FlowShareAmount({ n }: { n: number }) {
  return <span className={changeToneClass(directionFromChange(n))}>{formatFlowShares(n)}</span>;
}

function StockFlowHistoryTable({
  stockName,
  rows,
  loading,
}: {
  stockName: string;
  rows: FlowLeg[];
  loading?: boolean;
}) {
  const week = rows.slice(0, 7);

  return (
    <div className="flow-sheet">
      <div className="flow-sheet__head">
        <h4 className="flow-sheet__title">{stockName} 수급 · 최근 1주</h4>
      </div>
      <p className="flow-sheet__unit-line">단위: 주(순매매량) · 장중 실시간 아님 · 매매 신호 아님</p>

      {loading && week.length === 0 ? (
        <p className="retail-card__note">수급을 불러오는 중…</p>
      ) : week.length === 0 ? (
        <p className="retail-card__note">이 종목 수급 데이터를 불러오지 못했습니다.</p>
      ) : (
        <div className="flow-sheet__table-wrap">
          <table className="flow-sheet__table">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">외국인</th>
                <th scope="col">기관</th>
                <th scope="col">개인</th>
              </tr>
            </thead>
            <tbody>
              {week.map((day, i) => (
                <tr key={`${stockName}-${day.dateLabel}`} className={i === 0 ? "is-today" : undefined}>
                  <th scope="row">{day.dateLabel}</th>
                  <td>
                    <FlowShareAmount n={day.foreign} />
                  </td>
                  <td>
                    <FlowShareAmount n={day.institution} />
                  </td>
                  <td>
                    <FlowShareAmount n={day.personal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MegaCapSplit({
  title,
  topCaps,
  charts,
  showFlow,
  flow,
}: {
  title: string;
  topCaps: MegaCapQuote[];
  charts: Record<string, IndexChartSeries>;
  showFlow: boolean;
  flow: RetailScanBundle["flow"];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(topCaps[0]?.id ?? "");
  const [rightTab, setRightTab] = useState<"chart" | "flow">("chart");
  const [byStock, setByStock] = useState<Record<string, FlowLeg[]>>(flow.byStock ?? {});
  const [flowLoading, setFlowLoading] = useState(false);
  const flowFetchedRef = useRef(false);

  const seriesList = useMemo(
    () =>
      topCaps.map((q) => {
        const hit = charts[q.id];
        if (hit && hit.points.length >= 1) return hit;
        return {
          id: q.id,
          name: q.name,
          symbol: q.symbol,
          points: hit?.points ?? [],
          period: "1d" as const,
          source: "yahoo" as const,
        };
      }),
    [topCaps, charts],
  );

  const activeQuote = topCaps.find((q) => q.id === selectedId) ?? topCaps[0];
  const activeId = activeQuote?.id ?? "";
  const stockFlowRows = (activeId ? byStock[activeId] : undefined) ?? [];

  // SSR에서 byStock을 비우므로, 수급 탭을 열 때 클라이언트에서 로드
  useEffect(() => {
    if (!showFlow || !open || rightTab !== "flow") return;
    if (flowFetchedRef.current) return;
    const hasAny = topCaps.some((q) => (byStock[q.id]?.length ?? 0) > 0);
    if (hasAny) {
      flowFetchedRef.current = true;
      return;
    }

    let cancelled = false;
    flowFetchedRef.current = true;
    setFlowLoading(true);
    const ids = topCaps.map((q) => q.id).join(",");
    fetch(`/api/stock-flow?ids=${encodeURIComponent(ids)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("flow failed");
        return res.json() as Promise<{ byStock: Record<string, FlowLeg[]> }>;
      })
      .then((data) => {
        if (cancelled) return;
        setByStock((prev) => ({ ...prev, ...(data.byStock ?? {}) }));
      })
      .catch(() => {
        flowFetchedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setFlowLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // topCaps identity is stable per mount; byStock read only for initial seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFlow, open, rightTab]);

  return (
    <article className="retail-card retail-card--wide mega-split">
      <div className="mega-split__head">
        <div>
          <h3 className="retail-card__title">{title}</h3>
          <p className="retail-card__tip">시장 온도 참고용 대표주 · 추천·관심종목 아님</p>
        </div>
        <button
          type="button"
          className="pulse__detail-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "펼치기"}
        </button>
      </div>

      {!open ? (
        <p className="retail-card__note">
          {topCaps
            .slice(0, 3)
            .map((q) => q.name)
            .join(" · ")}
          {topCaps.length > 3 ? " 외" : ""}
        </p>
      ) : (
        <div className="mega-split__body">
          <div className="mega-split__table">
            <div className="mega-table">
              {topCaps.map((q, i) => {
                const selected = q.id === activeId;
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`mega-row mega-row--btn ${selected ? "mega-row--selected" : ""}`}
                    onClick={() => setSelectedId(q.id)}
                    aria-pressed={selected}
                  >
                    <span className="mega-row__rank">{i + 1}</span>
                    <span className="mega-row__name">
                      {q.name}
                      <small>{q.marketCapLabel}</small>
                    </span>
                    <span
                      className={`mega-row__px ${changeToneClass(directionFromChange(q.changePercent))}`}
                    >
                      {q.region === "US"
                        ? q.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
                        : q.value.toLocaleString("ko-KR")}
                    </span>
                    <span
                      className={`mega-row__chg ${changeToneClass(directionFromChange(q.changePercent))}`}
                    >
                      {formatSigned(q.changePercent)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mega-split__side">
            {showFlow ? (
              <div className="mega-split__tabs" role="tablist" aria-label="시총 상위 보조 보기">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === "chart"}
                  className={`mega-split__tab ${rightTab === "chart" ? "is-on" : ""}`}
                  onClick={() => setRightTab("chart")}
                >
                  차트
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightTab === "flow"}
                  className={`mega-split__tab ${rightTab === "flow" ? "is-on" : ""}`}
                  onClick={() => setRightTab("flow")}
                >
                  수급 1주
                </button>
              </div>
            ) : null}

            <div className="mega-split__panel">
              {rightTab === "chart" || !showFlow ? (
                <IndexMiniChart
                  seriesList={seriesList}
                  activeId={activeId}
                  onActiveChange={setSelectedId}
                  hideSelector
                  quoteChangePercent={activeQuote?.changePercent}
                />
              ) : (
                <StockFlowHistoryTable
                  stockName={activeQuote?.name ?? "종목"}
                  rows={stockFlowRows}
                  loading={flowLoading}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Ks200NightFuturesCard({ active }: { active: boolean }) {
  const [quote, setQuote] = useState<Ks200NightFuturesQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let intervalId: number | undefined;
    let idleId: number | undefined;
    let timerId: number | undefined;

    const stopPoll = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const load = async (opts?: { background?: boolean }): Promise<boolean> => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      if (!opts?.background) setLoading(true);
      try {
        const res = await fetch("/api/ks200-night", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Ks200NightFuturesQuote;
        if (cancelled) return false;
        setQuote(data);
        setError(null);
        return true;
      } catch {
        if (cancelled) return false;
        setError("야간선물 시세를 불러오지 못했습니다.");
        return false;
      } finally {
        if (!cancelled && !opts?.background) setLoading(false);
      }
    };

    const startPoll = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(() => void load({ background: true }), NIGHT_POLL_MS);
    };

    const begin = () => {
      void load().then((ok) => {
        if (!cancelled && ok && document.visibilityState !== "hidden") startPoll();
      });
    };

    // 첫 페인트 이후 야간선물 요청 (KR 탭 초기 버벅임 완화)
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(begin, { timeout: 2500 });
    } else {
      timerId = globalThis.setTimeout(begin, 800) as unknown as number;
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopPoll();
        return;
      }
      void load({ background: true }).then((ok) => {
        if (!cancelled && ok) startPoll();
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stopPoll();
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return (
    <article className="retail-card">
      <h3 className="retail-card__title">코스피200야간선물</h3>
      <p className="retail-card__tip">야간 온도 참고 · 주문·매매 판단용 아님 · 예측 아님</p>
      {quote ? (
        <>
          <p
            className={`retail-card__value ${changeToneClass(directionFromChange(quote.changePercent))}`}
          >
            {formatIndexValue(quote.price)}{" "}
            <span>({formatSigned(quote.changePercent)}%)</span>
          </p>
          <p className="retail-card__note">
            {quote.updated ? `갱신 ${quote.updated}` : quote.note}
            {loading ? " · 확인 중" : ""}
          </p>
        </>
      ) : error ? (
        <p className="retail-card__note">{error}</p>
      ) : (
        <p className="retail-card__note">{loading ? "불러오는 중…" : "시세 대기"}</p>
      )}
    </article>
  );
}

export function RetailScanPanel({
  scan,
  charts,
  scope = "all",
}: {
  scan: RetailScanBundle;
  charts: Record<string, IndexChartSeries>;
  scope?: MarketScope;
}) {
  const showNightFutures = scope === "kr";
  const showMega = scope === "kr" || scope === "us";
  const topCaps = scope === "us" ? scan.topCapsUs : scan.topCapsKr;
  const topCapsTitle =
    scope === "us" ? "미국 시가총액 상위 5" : "국내 시가총액 상위 5";
  const showFlowInMega = scope === "kr";
  const signals =
    scope === "us"
      ? scan.signals.filter((s) => s.id !== "ks200-vs-kospi" && s.id !== "top5-kr-avg")
      : scope === "kr"
        ? scan.signals.filter((s) => s.id !== "top5-us-avg")
        : scan.signals;

  return (
    <section className="board-block retail-scan" aria-labelledby="retail-scan-title">
      <div className="block-head">
        <div>
          <h2 id="retail-scan-title" className="block-head__title">
            바로 볼 지표
          </h2>
          <p className="block-head__sub">예측이 아니라 오늘 온도를 읽는 참고 지표</p>
        </div>
      </div>

      <div className={`retail-scan__grid ${showNightFutures ? "" : "retail-scan__grid--single"}`}>
        {showNightFutures ? <Ks200NightFuturesCard active={showNightFutures} /> : null}

        <article className="retail-card">
          <h3 className="retail-card__title">기대·경계 신호</h3>
          <p className="retail-card__tip">방향 예측이 아니라, 오늘 시장 온도·흔들림을 보는 참고.</p>
          <ul className="retail-signals">
            {signals.map((s) => (
              <li key={s.id}>
                <div className="retail-signals__row">
                  <strong title={SIGNAL_TIPS[s.id]}>{s.name}</strong>
                  <span className={changeToneClass(s.direction)}>{s.value}</span>
                </div>
                {SIGNAL_TIPS[s.id] ? <p className="retail-signals__tip">{SIGNAL_TIPS[s.id]}</p> : null}
                <p>{s.hint}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {showMega ? (
        <MegaCapSplit
          title={topCapsTitle}
          topCaps={topCaps}
          charts={charts}
          showFlow={showFlowInMega}
          flow={scan.flow}
        />
      ) : null}
    </section>
  );
}
