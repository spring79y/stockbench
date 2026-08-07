import type { EditorialView } from "@/lib/pipeline/types";
import { buildOverviewMarketCue } from "@/lib/pipeline/overviewCue";
import {
  formatBriefingClock,
  formatBriefingUpdatedAt,
} from "@/lib/events/catalog";
import styles from "./OverviewDualBrief.module.css";

/** 증시개요 — 한·미 짧은 브리핑 + Decision 큐 ≤2 (풀 A/B 복제 없음). */
export function OverviewDualBrief({
  kr,
  us,
}: {
  kr: EditorialView;
  us: EditorialView;
}) {
  const krClock = formatBriefingClock(kr.publishedAt);
  const usClock = formatBriefingClock(us.publishedAt);
  const stampLine =
    krClock && usClock
      ? `한국 ${krClock} · 미국 ${usClock}`
      : krClock
        ? `한국 ${krClock}`
        : usClock
          ? `미국 ${usClock}`
          : null;

  return (
    <section className="board-block overview-dual" aria-labelledby="overview-brief-title">
      <div className="block-head">
        <div>
          <h2 id="overview-brief-title" className="block-head__title">
            한눈 브리핑
          </h2>
          <p className="block-head__sub">
            {stampLine ? (
              <>
                <span className={styles.stampLine}>{stampLine}</span>
                <span className={styles.stampSep}> · </span>
              </>
            ) : null}
            자세한 내용은 각 탭
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <OverviewSideBrief
          label="한국"
          view={kr}
          updated={formatBriefingUpdatedAt(kr.publishedAt)}
        />
        <OverviewSideBrief
          label="미국"
          view={us}
          updated={formatBriefingUpdatedAt(us.publishedAt)}
        />
      </div>
    </section>
  );
}

function OverviewSideBrief({
  label,
  view,
  updated,
}: {
  label: string;
  view: EditorialView;
  updated: string;
}) {
  const bullets = view.briefing.bullets.slice(0, 2);
  const cue = buildOverviewMarketCue(view);

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.label}>{label}</h3>
        {updated ? (
          <p className={styles.updated} title="브리핑 발행 시각(KST)">
            {updated}
          </p>
        ) : null}
      </header>
      {view.briefing.headline ? (
        <p className={styles.headline}>{view.briefing.headline}</p>
      ) : null}
      {bullets.length > 0 ? (
        <ul className={styles.bullets}>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {cue ? (
        <div className={styles.cue}>
          {cue.cue ? <p className={styles.cueLine}>{cue.cue}</p> : null}
          {cue.checks.length > 0 ? (
            <ul className={styles.checks}>
              {cue.checks.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
