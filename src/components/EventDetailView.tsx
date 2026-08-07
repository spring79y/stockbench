"use client";

import Link from "next/link";
import { IndexMiniChart } from "@/components/IndexMiniChart";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import type { EventDetailContent } from "@/lib/events/catalog";
import {
  LABEL_EPS_EXPECTED,
  LABEL_OP_EXPECTED,
  LABEL_REVENUE_EXPECTED,
  consensusNoteFor,
} from "@/lib/events/earningsCopy";
import {
  earningsResultLines,
  shouldShowEarningsResult,
} from "@/lib/events/earningsDetail";
import { buildEventDetailSummary } from "@/lib/events/attachEventDetailSummaries";
import {
  hasStructuredEarningsActual,
  isEarningsAnnounced,
} from "@/lib/market/earningsAnnounced";
import type { EventDetailSummary, MarketEvent } from "@/lib/types";
import styles from "./EventDetailView.module.css";

const levelLabel = {
  high: "필수",
  medium: "관심",
  low: "참고",
} as const;

const regionLabel = {
  KR: "국내",
  US: "미국",
  GLOBAL: "글로벌",
} as const;

const levelClass = {
  high: styles.levelHigh,
  medium: styles.levelMedium,
  low: styles.levelLow,
} as const;

function safeBackHref(from: string | undefined): string {
  if (!from) return "/";
  // only allow returning to home (with optional view query)
  if (from === "/") return "/";
  if (/^\/\?view=(all|kr|us)$/.test(from)) return from;
  return "/";
}

/** Split scan bullets on newlines only — never on 「 · 」(earnings fact copy). */
function splitBullets(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n+/)
    .map((s) => s.replace(/^[·•\-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

/** Always rebuild from Evidence facts — stale published boilerplate must not stick. */
function resolveSummary(event: MarketEvent): EventDetailSummary {
  return buildEventDetailSummary(event);
}

export function EventDetailView({
  event,
  detail,
  charts,
  backHref,
}: {
  event: MarketEvent;
  detail: EventDetailContent;
  charts: IndexChartSeries[];
  backHref?: string;
}) {
  const back = safeBackHref(backHref);
  const periodSet = charts.some((c) => c.source === "fred") ? "indicator" : "stock";
  const summary = resolveSummary(event);
  const announced =
    event.kind === "earnings"
      ? isEarningsAnnounced(event) || hasStructuredEarningsActual(event.actual)
      : Boolean(summary.result);
  const showEarningsResult = shouldShowEarningsResult(event);
  const resultLines =
    event.kind === "earnings" && showEarningsResult
      ? earningsResultLines(event)
      : summary.result
        ? [summary.result]
        : [];
  const meaningLines = splitBullets(summary.meaning);
  const reactionLines = splitBullets(summary.reaction);
  const implicationLines = splitBullets(summary.implication);
  const showPost = announced || resultLines.length > 0 || reactionLines.length > 0;

  return (
    <main className={`board ${styles.root}`}>
      <div className={styles.nav}>
        <Link href={back} className={styles.back} scroll={false}>
          ← 브리핑으로
        </Link>
      </div>

      <article className={`board-block ${styles.hero}`}>
        <div className={styles.meta}>
          <time className={styles.date}>{event.dateLabel}</time>
          <span>{regionLabel[event.region]}</span>
          <span className={`${styles.level} ${levelClass[event.level]}`}>
            {levelLabel[event.level]}
          </span>
        </div>
        <h1 className={styles.title}>{event.title}</h1>
        <p className={styles.oneliner}>{event.oneLiner}</p>
      </article>

      <section className={`board-block ${styles.scan}`} aria-labelledby="event-pre">
        <h2 id="event-pre" className={styles.sectionTitle}>
          발표 전
        </h2>

        <h3 className={styles.sub}>시장 기대</h3>
        {event.kind === "earnings" && event.consensus ? (
          <div className={styles.consensus}>
            {event.consensus.revenueLabel ? (
              <p className={styles.consensusPrimary}>
                <strong>{LABEL_REVENUE_EXPECTED}</strong>
                <span className={styles.consensusValue}>
                  {event.consensus.revenueLabel}
                </span>
                <span className={styles.consensusHint}>회사 규모</span>
              </p>
            ) : null}
            {event.consensus.operatingProfitLabel ? (
              <p className={styles.consensusPrimary}>
                <strong>{LABEL_OP_EXPECTED}</strong>
                <span className={styles.consensusValue}>
                  {event.consensus.operatingProfitLabel}
                </span>
                <span className={styles.consensusHint}>회사 규모</span>
              </p>
            ) : null}
            {event.consensus.epsLabel ? (
              event.consensus.operatingProfitLabel ? (
                <details className={styles.consensusFold}>
                  <summary>{LABEL_EPS_EXPECTED}</summary>
                  <p className={styles.consensusSecondary}>
                    <span className={styles.consensusValue}>
                      {event.consensus.epsLabel}
                    </span>
                    <span className={styles.consensusHint}>주당 · 서프라이즈 참고</span>
                  </p>
                </details>
              ) : (
                <p className={styles.consensusSecondary}>
                  <strong>{LABEL_EPS_EXPECTED}</strong>
                  <span className={styles.consensusValue}>
                    {event.consensus.epsLabel}
                  </span>
                  <span className={styles.consensusHint}>주당</span>
                </p>
              )
            ) : null}
            <p className={styles.consensusNote}>
              {consensusNoteFor({
                ...event.consensus,
                postReport: announced,
              })}
            </p>
          </div>
        ) : summary.expectation ? (
          <p className={styles.body}>{summary.expectation}</p>
        ) : (
          <p className={styles.empty}>시장 기대 숫자가 아직 없습니다.</p>
        )}

        <h3 className={styles.sub}>점검 포인트</h3>
        {meaningLines.length > 0 ? (
          <ul className={styles.scanList}>
            {meaningLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.body}>{detail.meaning}</p>
        )}
      </section>

      {showPost ? (
        <section className={`board-block ${styles.scan}`} aria-labelledby="event-post">
          <h2 id="event-post" className={styles.sectionTitle}>
            발표 후
          </h2>

          <h3 className={styles.sub}>결과</h3>
          {resultLines.length > 0 ? (
            <div className={styles.result} aria-label="결과">
              {resultLines.map((line) => (
                <p key={line} className={styles.resultLine}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>결과 숫자가 아직 없습니다.</p>
          )}

          <h3 className={styles.sub}>시장 반응</h3>
          {reactionLines.length > 0 ? (
            <ul className={styles.scanList}>
              {reactionLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>반응 근거 부족</p>
          )}

          <h3 className={styles.sub}>발표 후 점검</h3>
          {implicationLines.length > 0 ? (
            <ul className={styles.scanList}>
              {implicationLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Evidence가 없어 해석을 붙이지 않았습니다.</p>
          )}
        </section>
      ) : null}

      <section className="board-block" aria-labelledby="event-watch">
        <h2 id="event-watch" className={styles.sectionTitle}>
          같이 볼 것
        </h2>
        <ul className={styles.list}>
          {detail.watchPoints.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="board-block" aria-labelledby="event-chart">
        <h2 id="event-chart" className={styles.sectionTitle}>
          관련 지표 차트
        </h2>
        <p className={styles.note}>{detail.chartNote}</p>
        {charts.length > 0 ? (
          <div className={styles.chart}>
            <IndexMiniChart
              seriesList={charts}
              selectorLabel="관련 지표"
              periodSet={periodSet}
              defaultPeriod={periodSet === "indicator" ? "1y" : "3m"}
            />
          </div>
        ) : (
          <p className="retail-card__note">관련 지표 차트를 불러오지 못했습니다.</p>
        )}
      </section>

      <section className="board-block" aria-labelledby="event-news">
        <h2 id="event-news" className={styles.sectionTitle}>
          참고 뉴스·해설
        </h2>
        <p className={styles.note}>매매 추천이 아닙니다. 일정 이해용 참고 문구입니다.</p>
        <ul className={styles.news}>
          {detail.news.map((n) => (
            <li key={n.id} className={styles.newsItem}>
              <div className={styles.newsTop}>
                <span className={styles.newsSource}>{n.source}</span>
                <span>{n.publishedLabel}</span>
              </div>
              <strong className={styles.newsTitle}>{n.title}</strong>
              <p className={styles.newsSummary}>{n.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
