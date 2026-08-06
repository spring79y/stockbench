"use client";

import Link from "next/link";
import {
  eventResultComment,
  filterRetainedUpcomingEvents,
} from "@/lib/events/upcomingRetention";
import type { MarketEvent } from "@/lib/types";
import type { MarketScope } from "@/lib/market/scope";
import styles from "./EventList.module.css";

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

function homePath(scope: MarketScope): string {
  return scope === "all" ? "/" : `/?view=${scope}`;
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EventList({
  events,
  scope = "all",
  stepNo = 4,
}: {
  events: MarketEvent[];
  scope?: MarketScope;
  /** 증시개요는 1, 한·미 탭은 4 */
  stepNo?: number;
}) {
  const from = homePath(scope);
  // Same KST day keeps (with/without result); prior KST days drop.
  const retained = filterRetainedUpcomingEvents(events);

  return (
    <section id="events" className="board-block events" aria-labelledby="events-title">
      <div className="block-head">
        <span className="step-no">{stepNo}</span>
        <div>
          <h2 id="events-title" className="block-head__title">
            다가오는 일정
          </h2>
          <p className="block-head__sub">일정을 누르면 의미·차트·참고 해설을 볼 수 있습니다</p>
        </div>
      </div>

      <ul className={styles.list}>
        {retained.map((event) => {
          const resultComment = eventResultComment(event);
          const bodyLine = resultComment ?? event.oneLiner;
          return (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}?from=${encodeURIComponent(from)}`}
                className={styles.row}
              >
                <div className={styles.main}>
                  <div className={styles.meta}>
                    <time>{event.dateLabel}</time>
                    <span>{regionLabel[event.region]}</span>
                    <span className={`${styles.level} ${levelClass[event.level]}`}>
                      {levelLabel[event.level]}
                    </span>
                    {event.kind === "earnings" ? (
                      <span className={styles.kindEarnings}>실적</span>
                    ) : null}
                  </div>
                  <div className={styles.body}>
                    <strong>{event.title}</strong>
                    <p className={resultComment ? styles.resultLine : undefined}>{bodyLine}</p>
                  </div>
                </div>
                <Chevron />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
