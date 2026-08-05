import type { EditorialView } from "@/lib/pipeline/types";
import { formatBriefingUpdatedAt } from "@/lib/events/catalog";
import styles from "./OverviewDualBrief.module.css";

/** 증시개요 — 한·미 짧은 브리핑을 나란히 */
export function OverviewDualBrief({
  kr,
  us,
}: {
  kr: EditorialView;
  us: EditorialView;
}) {
  return (
    <section className="board-block overview-dual" aria-labelledby="overview-brief-title">
      <div className="block-head">
        <div>
          <h2 id="overview-brief-title" className="block-head__title">
            한눈 브리핑
          </h2>
          <p className="block-head__sub">한국·미국 핵심만 · 자세한 내용은 각 탭</p>
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
  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.label}>{label}</h3>
        {updated ? <p className={styles.updated}>{updated}</p> : null}
      </header>
      <p className={styles.headline}>{view.briefing.headline}</p>
      <ul className={styles.bullets}>
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </article>
  );
}
