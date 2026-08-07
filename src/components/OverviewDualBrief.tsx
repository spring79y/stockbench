import type { EditorialView } from "@/lib/pipeline/types";
import { buildOverviewMarketCue } from "@/lib/pipeline/overviewCue";
import { formatBriefingClock } from "@/lib/events/catalog";
import styles from "./OverviewDualBrief.module.css";

/** 증시개요 — Decision 1줄 큐 + 점검 ≤2 (한·미). 풀 A/B·풀 브리핑 복제 없음. */
export function OverviewDualBrief({
  kr,
  us,
}: {
  kr: EditorialView;
  us: EditorialView;
}) {
  const krCue = buildOverviewMarketCue(kr);
  const usCue = buildOverviewMarketCue(us);
  if (!krCue && !usCue) return null;

  const krClock = formatBriefingClock(kr.publishedAt) ?? "";
  const usClock = formatBriefingClock(us.publishedAt) ?? "";
  const stampLine =
    krClock && usClock
      ? `한국 ${krClock} · 미국 ${usClock}`
      : krClock
        ? `한국 ${krClock}`
        : usClock
          ? `미국 ${usClock}`
          : null;

  return (
    <section className="board-block overview-dual" aria-labelledby="overview-cue-title">
      <div className="block-head">
        <div>
          <h2 id="overview-cue-title" className="block-head__title">
            그래서 뭘 보면 되지
          </h2>
          <p className="block-head__sub">
            {stampLine ? (
              <>
                <span className={styles.stampLine}>{stampLine}</span>
                <span className={styles.stampSep}> · </span>
              </>
            ) : null}
            한·미 각 1줄 · 자세한 시나리오는 각 탭
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {krCue ? (
          <OverviewSideCue
            label="한국"
            cue={krCue.cue}
            checks={krCue.checks}
            clock={krClock}
          />
        ) : null}
        {usCue ? (
          <OverviewSideCue
            label="미국"
            cue={usCue.cue}
            checks={usCue.checks}
            clock={usClock}
          />
        ) : null}
      </div>
    </section>
  );
}

function OverviewSideCue({
  label,
  cue,
  checks,
  clock,
}: {
  label: string;
  cue: string;
  checks: Array<{ id: string; text: string }>;
  clock: string;
}) {
  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.label}>{label}</h3>
        {clock ? (
          <p className={styles.updated} title="브리핑 발행 시각(KST)">
            {clock}
          </p>
        ) : null}
      </header>
      {cue ? <p className={styles.cueLine}>{cue}</p> : null}
      {checks.length > 0 ? (
        <ul className={styles.checks}>
          {checks.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
