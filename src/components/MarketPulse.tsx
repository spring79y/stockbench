"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import type { IndexQuote } from "@/lib/types";
import {
  changeToneClass,
  directionFromChange,
  formatIndexValue,
  formatSigned,
} from "@/lib/format";
import { formatFlowAmount } from "@/lib/market/flowFormat";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import { chartsForQuotes } from "@/lib/market/chartTypes";
import type { MarketScope } from "@/lib/market/scope";
import type { FlowLeg, RetailScanBundle } from "@/lib/market/retailScan";
import { summarizeOtherMarket } from "@/lib/market/session";

const IndexMiniChart = dynamic(
  () => import("@/components/IndexMiniChart").then((m) => m.IndexMiniChart),
  { loading: () => <p className="mini-chart__empty">불러오는 중…</p> },
);

function FlowAmount({ n }: { n: number }) {
  return <span className={changeToneClass(directionFromChange(n))}>{formatFlowAmount(n)}</span>;
}

function IndexFlowTable({
  marketName,
  rows,
}: {
  marketName: string;
  rows: FlowLeg[];
}) {
  const week = rows.slice(0, 7);

  return (
    <div className="flow-sheet">
      <div className="flow-sheet__head">
        <h4 className="flow-sheet__title">{marketName} 수급 · 최근 1주</h4>
      </div>
      <p className="flow-sheet__unit-line">단위: 억원 · 장중 실시간 아님 · 매매 신호 아님</p>

      {week.length === 0 ? (
        <p className="retail-card__note">수급 데이터를 불러오지 못했습니다.</p>
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
                <tr key={`${marketName}-${day.dateLabel}`} className={i === 0 ? "is-today" : undefined}>
                  <th scope="row">{day.dateLabel}</th>
                  <td>
                    <FlowAmount n={day.foreign} />
                  </td>
                  <td>
                    <FlowAmount n={day.institution} />
                  </td>
                  <td>
                    <FlowAmount n={day.personal} />
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

function QuoteRow({
  quote,
  selected,
  onSelect,
}: {
  quote: IndexQuote;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const direction = directionFromChange(quote.change);
  const tone = changeToneClass(direction);
  const interactive = Boolean(onSelect);

  const body = (
    <>
      <div className="quote-row__name">
        <span className="quote-row__label">{quote.name}</span>
        <span className="quote-row__status">{quote.status}</span>
      </div>
      <div className={`quote-row__value ${tone}`}>{formatIndexValue(quote.value)}</div>
      <div className={`quote-row__change ${tone}`}>
        <span>{formatSigned(quote.changePercent)}%</span>
        <span className="quote-row__pts">{formatSigned(quote.change)}</span>
      </div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={`quote-row quote-row--btn ${selected ? "quote-row--selected" : ""}`}
        onClick={() => onSelect?.(quote.id)}
        aria-pressed={selected}
      >
        {body}
      </button>
    );
  }

  return <div className="quote-row">{body}</div>;
}

function QuotePanel({
  label,
  quotes,
  selectedId,
  onSelect,
}: {
  label: string;
  quotes: IndexQuote[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="quote-panel">
      <h3 className="quote-panel__label">
        {label}
      </h3>
      {quotes.map((q) => (
        <QuoteRow
          key={q.id}
          quote={q}
          selected={selectedId === q.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CollapsedOther({
  title,
  summary,
  panelLabel,
  quotes,
}: {
  title: string;
  summary: string;
  panelLabel: string;
  quotes: IndexQuote[];
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="other-market">
      <button
        type="button"
        className="other-market__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="other-market__copy">
          <span className="other-market__title">{title}</span>
          <span className="other-market__summary">{summary}</span>
        </span>
        <span className="other-market__chevron" aria-hidden>
          {open ? "접기" : "펼치기"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="other-market__body">
          <QuotePanel label={panelLabel} quotes={quotes} />
        </div>
      ) : null}
    </div>
  );
}

function ScopedPulse({
  label,
  quotes,
  chartSeries,
  showFlow,
  flow,
  detailOpen: detailOpenControlled,
  onDetailOpenChange,
}: {
  label: string;
  quotes: IndexQuote[];
  chartSeries: IndexChartSeries[];
  showFlow?: boolean;
  flow?: RetailScanBundle["flow"];
  /** When set (overview dual panels), parent owns expand to limit concurrent chart fetches. */
  detailOpen?: boolean;
  onDetailOpenChange?: (open: boolean) => void;
}) {
  const [activeId, setActiveId] = useState(chartSeries[0]?.id ?? quotes[0]?.id ?? "");
  const [rightTab, setRightTab] = useState<"chart" | "flow">("chart");
  const [detailOpenLocal, setDetailOpenLocal] = useState(false);
  const controlled = typeof detailOpenControlled === "boolean";
  const detailOpen = controlled ? detailOpenControlled : detailOpenLocal;
  const setDetailOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(detailOpen) : next;
    if (controlled) onDetailOpenChange?.(value);
    else setDetailOpenLocal(value);
  };

  const activeQuote = quotes.find((q) => q.id === activeId) ?? quotes[0];
  const resolvedId = activeQuote?.id ?? activeId;
  const flowMarket = resolvedId === "kosdaq" ? "kosdaq" : "kospi";
  const flowRows =
    flowMarket === "kosdaq"
      ? (flow?.kosdaqHistory ?? []).slice(0, 7)
      : (flow?.kospiHistory ?? []).slice(0, 7);
  const flowTitle = flowMarket === "kosdaq" ? "코스닥" : "코스피";

  return (
    <div className="pulse__scoped pulse__scoped--compact">
      <QuotePanel
        label={label}
        quotes={quotes}
        selectedId={detailOpen ? resolvedId : undefined}
        onSelect={detailOpen ? setActiveId : undefined}
      />
      <button
        type="button"
        className="pulse__detail-toggle"
        aria-expanded={detailOpen}
        onClick={() => setDetailOpen(!detailOpen)}
      >
        {detailOpen
          ? showFlow
            ? "차트·수급 접기"
            : "차트 접기"
          : showFlow
            ? "차트·수급 펼치기"
            : "차트 펼치기"}
      </button>
      {detailOpen ? (
        <div className="pulse__chart">
          {showFlow ? (
            <div className="mega-split__tabs pulse__side-tabs" role="tablist" aria-label="지수 보조 보기">
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

          {rightTab === "flow" && showFlow ? (
            <IndexFlowTable marketName={flowTitle} rows={flowRows} />
          ) : (
            <IndexMiniChart
              seriesList={chartSeries}
              activeId={resolvedId}
              onActiveChange={setActiveId}
              hideSelector
              quoteChangePercent={activeQuote?.changePercent}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MarketPulse({
  quotes,
  charts,
  scope,
  temperature,
  moodLabel,
  mood,
  asOfLabel,
  flow,
}: {
  quotes: IndexQuote[];
  charts: Record<string, IndexChartSeries>;
  scope: MarketScope;
  temperature: string;
  moodLabel: string;
  mood: string;
  asOfLabel: string;
  flow?: RetailScanBundle["flow"];
}) {
  const kr = quotes.filter((q) => q.region === "KR");
  const us = quotes.filter((q) => q.region === "US");
  const krCharts = chartsForQuotes(charts, kr);
  const usCharts = chartsForQuotes(charts, us);
  // Overview: only one dual panel expanded at a time → one chart fetch budget.
  const [openOverviewPanel, setOpenOverviewPanel] = useState<"kr" | "us" | null>(null);

  return (
    <section id="pulse" className="board-block pulse" aria-labelledby="pulse-title">
      <div className="block-head">
        <div>
          <h2 id="pulse-title" className="block-head__title">
            시장 온도
          </h2>
          <p className="block-head__sub">
            {asOfLabel} · 실시간 호가·매매 판단용 아님
          </p>
        </div>
        <div className="block-head__meta">
          <span className={`mood-badge mood-badge--${mood}`}>{moodLabel}</span>
          <p className="pulse__temp">{temperature}</p>
        </div>
      </div>

      {scope === "all" ? (
        <div className="pulse__panels pulse__panels--stacked">
          <ScopedPulse
            label="국내"
            quotes={kr}
            chartSeries={krCharts}
            showFlow={false}
            flow={flow}
            detailOpen={openOverviewPanel === "kr"}
            onDetailOpenChange={(open) => setOpenOverviewPanel(open ? "kr" : null)}
          />
          <ScopedPulse
            label="미국"
            quotes={us}
            chartSeries={usCharts}
            detailOpen={openOverviewPanel === "us"}
            onDetailOpenChange={(open) => setOpenOverviewPanel(open ? "us" : null)}
          />
        </div>
      ) : null}

      {scope === "kr" ? (
        <>
          <ScopedPulse
            label="국내"
            quotes={kr}
            chartSeries={krCharts}
            showFlow
            flow={flow}
          />
          <CollapsedOther
            title="미국 · 접힌 보조"
            summary={summarizeOtherMarket(quotes, "US")}
            panelLabel="미국"
            quotes={us}
          />
        </>
      ) : null}

      {scope === "us" ? (
        <>
          <ScopedPulse label="미국" quotes={us} chartSeries={usCharts} />
          <CollapsedOther
            title="한국 · 접힌 보조"
            summary={summarizeOtherMarket(quotes, "KR")}
            panelLabel="국내"
            quotes={kr}
          />
        </>
      ) : null}
    </section>
  );
}
