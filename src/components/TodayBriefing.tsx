import type { DailyBriefing, MacroChip } from "@/lib/types";
import { changeToneClass } from "@/lib/format";
import styles from "./TodayBriefing.module.css";

export function TodayBriefing({
  briefing,
  macros,
  updatedLabel,
  fromPipeline,
  refreshLabel,
}: {
  briefing: DailyBriefing;
  macros: MacroChip[];
  updatedLabel?: string;
  fromPipeline?: boolean;
  /** 장중 리프레시일 때 짧은 라벨 */
  refreshLabel?: boolean;
}) {
  const evidence = macros.filter((m) => briefing.evidenceIds.includes(m.id));

  return (
    <section id="briefing" className="board-block briefing" aria-labelledby="briefing-title">
      <div className="block-head">
        <span className="step-no">1</span>
        <div>
          <h2 id="briefing-title" className="block-head__title">
            오늘의 브리핑
          </h2>
          {updatedLabel ? (
            <p className="block-head__sub">
              {refreshLabel ? "장중 리프레시 · " : "가장 최근 업데이트 · "}
              {updatedLabel}
              {fromPipeline === false ? " · 목 데이터" : ""}
            </p>
          ) : null}
        </div>
      </div>

      <h3 className={styles.headline}>{briefing.headline}</h3>
      <ul className={styles.bullets}>
        {briefing.bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className={styles.evidence}>
        <p className={styles.evidenceLabel}>근거 지표</p>
        <div className={styles.chips}>
          {evidence.map((chip) => (
            <div key={chip.id} className={styles.chip}>
              <span className={styles.chipName}>{chip.name}</span>
              <span className={styles.chipValue}>{chip.value}</span>
              <span className={`${styles.chipChange} ${changeToneClass(chip.direction)}`}>
                {chip.changeLabel}
              </span>
            </div>
          ))}
        </div>
        <div className={`${styles.chips} ${styles.chipsRest}`}>
          {macros
            .filter((m) => !briefing.evidenceIds.includes(m.id))
            .map((chip) => (
              <div key={chip.id} className={`${styles.chip} ${styles.chipMuted}`}>
                <span className={styles.chipName}>{chip.name}</span>
                <span className={styles.chipValue}>{chip.value}</span>
                <span className={`${styles.chipChange} ${changeToneClass(chip.direction)}`}>
                  {chip.changeLabel}
                </span>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
