import type { MacroChip } from "@/lib/types";
import { changeToneClass } from "@/lib/format";
import styles from "./OverviewMacroStrip.module.css";

const OVERVIEW_MACRO_IDS = ["usdkkrw", "us10y", "wti"] as const;

/** 증시개요 — 환율·금리·유가 (온도용 소수 지표) */
export function OverviewMacroStrip({ macros }: { macros: MacroChip[] }) {
  const chips = OVERVIEW_MACRO_IDS.map((id) => macros.find((m) => m.id === id)).filter(
    (m): m is MacroChip => Boolean(m),
  );

  if (chips.length === 0) return null;

  return (
    <section className="board-block overview-macros" aria-labelledby="overview-macros-title">
      <div className={styles.head}>
        <h2 id="overview-macros-title" className={styles.title}>
          환율·금리·유가
        </h2>
        <p className={styles.sub}>시장 온도 맥락 · 매매 판단용 아님</p>
      </div>
      <div className={styles.row}>
        {chips.map((chip) => (
          <div key={chip.id} className={styles.chip}>
            <span className={styles.name}>{chip.name}</span>
            <span className={styles.value}>{chip.value}</span>
            <span className={`${styles.change} ${changeToneClass(chip.direction)}`}>
              {chip.changeLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
