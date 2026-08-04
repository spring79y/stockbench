"use client";

import Link from "next/link";
import { IndexMiniChart } from "@/components/IndexMiniChart";
import type { IndexChartSeries } from "@/lib/market/chartTypes";
import type { EventDetailContent } from "@/lib/events/catalog";
import type { MarketEvent } from "@/lib/types";
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

      <section className="board-block" aria-labelledby="event-meaning">
        <h2 id="event-meaning" className={styles.sectionTitle}>
          이게 뭔가요
        </h2>
        <p className={styles.body}>{detail.meaning}</p>
        <h3 className={styles.sub}>왜 보나요</h3>
        <p className={styles.body}>{detail.whyItMatters}</p>
      </section>

      <section className="board-block" aria-labelledby="event-watch">
        <h2 id="event-watch" className={styles.sectionTitle}>
          같이 볼 것
        </h2>
        <ul className={styles.list}>
          {detail.watchPoints.map((item) => (
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
