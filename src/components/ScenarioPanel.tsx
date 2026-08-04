import type { Scenario } from "@/lib/types";
import styles from "./ScenarioPanel.module.css";

export function ScenarioPanel({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <section id="scenarios" className="board-block scenarios" aria-labelledby="scenarios-title">
      <div className="block-head">
        <span className="step-no">2</span>
        <div>
          <h2 id="scenarios-title" className="block-head__title">
            시나리오
          </h2>
          <p className="block-head__sub">경우의 수 · 추천 아님</p>
        </div>
      </div>

      <div className={styles.grid}>
        {scenarios.map((item) => (
          <article
            key={item.id}
            className={`${styles.card} ${item.id === "risk" ? styles.cardRisk : ""}`}
          >
            <p className={styles.label}>{item.label}</p>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.summary}>{item.summary}</p>
            <p className={styles.implication}>
              <span>기준</span>
              {item.implication}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
