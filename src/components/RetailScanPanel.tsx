"use client";

import { useEffect, useMemo, useState } from "react";
import { IndexMiniChart } from "@/components/IndexMiniChart";
import { changeToneClass, directionFromChange, formatIndexValue, formatSigned } from "@/lib/format";
import { formatFlowShares } from "@/lib/market/flowFormat";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import type { MarketScope } from "@/lib/market/scope";
import type { FlowLeg, MegaCapQuote, RetailScanBundle } from "@/lib/market/retailScan";
import type { StockNewsItem } from "@/lib/market/fetchStockNews";
import newsStyles from "./MegaNews.module.css";

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
}: {
  stockName: string;
  rows: FlowLeg[];
}) {
  const week = rows.slice(0, 7);

  return (
    <div className="flow-sheet">
      <div className="flow-sheet__head">
        <h4 className="flow-sheet__title">{stockName} 수급 · 최근 1주</h4>
      </div>
      <p className="flow-sheet__unit-line">단위: 주(순매매량) · 장중 실시간 아님 · 매매 신호 아님</p>

      {week.length === 0 ? (
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
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(false);

  const seriesList = useMemo(
    () =>
      topCaps
        .map((q) => charts[q.id])
        .filter((s): s is IndexChartSeries => Boolean(s && s.points.length >= 2)),
    [topCaps, charts],
  );

  const activeQuote = topCaps.find((q) => q.id === selectedId) ?? topCaps[0];
  const activeId = activeQuote?.id ?? "";
  const stockFlowRows = (activeId ? flow.byStock[activeId] : undefined) ?? [];

  useEffect(() => {
    if (!open || !activeQuote) {
      setNews([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      id: activeQuote.id,
      name: activeQuote.name,
      symbol: activeQuote.symbol,
      region: activeQuote.region,
      limit: "5",
    });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    setNewsLoading(true);
    setNewsError(false);
    fetch(`/api/stock-news?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("news failed");
        return res.json() as Promise<{ items: StockNewsItem[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setNews((data.items ?? []).slice(0, 5));
      })
      .catch(() => {
        if (cancelled) return;
        setNews([]);
        setNewsError(true);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, activeQuote?.id, activeQuote?.name, activeQuote?.symbol, activeQuote?.region]);

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
        <>
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
                  />
                )}
              </div>
            </div>
          </div>

          <div className={`flow-sheet ${newsStyles.wrap}`} aria-live="polite">
            <div className="flow-sheet__head">
              <h4 className="flow-sheet__title">{activeQuote?.name ?? "종목"} · 관련 뉴스</h4>
              <span className="flow-sheet__unit">최신순 · 참고용</span>
            </div>

            {newsLoading ? (
              <p className="retail-card__note">뉴스를 불러오는 중…</p>
            ) : newsError ? (
              <p className="retail-card__note">관련 뉴스를 불러오지 못했습니다.</p>
            ) : news.length === 0 ? (
              <p className="retail-card__note">최근 관련 뉴스가 없습니다.</p>
            ) : (
              <div className="flow-sheet__table-wrap">
                <table className="flow-sheet__table">
                  <thead>
                    <tr>
                      <th scope="col">시간</th>
                      <th scope="col">출처</th>
                      <th scope="col" className={newsStyles.thTitle}>
                        헤드라인
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {news.map((n, i) => (
                      <tr key={n.id} className={i === 0 ? newsStyles.latest : undefined}>
                        <th scope="row">
                          <time dateTime={n.publishedAt || undefined}>{n.publishedLabel}</time>
                        </th>
                        <td className={newsStyles.tdSource}>
                          <span title={n.publisher}>{n.publisher}</span>
                        </td>
                        <td className={newsStyles.tdTitle}>
                          {n.link ? (
                            <a
                              href={n.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={newsStyles.link}
                            >
                              {n.title}
                            </a>
                          ) : (
                            <span className={newsStyles.link}>{n.title}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
  const showKs200 = scope !== "us";
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

      <div className={`retail-scan__grid ${showKs200 ? "" : "retail-scan__grid--single"}`}>
        {showKs200 ? (
          <article className="retail-card">
            <h3 className="retail-card__title">코스피200</h3>
            <p className="retail-card__tip">대형주 200개 지수. 야간선물 호가가 아닌 참고 시세.</p>
            {scan.ks200 ? (
              <>
                <p
                  className={`retail-card__value ${changeToneClass(directionFromChange(scan.ks200.changePercent))}`}
                >
                  {formatIndexValue(scan.ks200.value)}{" "}
                  <span>({formatSigned(scan.ks200.changePercent)}%)</span>
                </p>
                <p className="retail-card__note">{scan.ks200.note}</p>
              </>
            ) : (
              <p className="retail-card__note">코스피200 시세를 불러오지 못했습니다.</p>
            )}
          </article>
        ) : null}

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
