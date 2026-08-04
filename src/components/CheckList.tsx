import type { CheckItem } from "@/lib/types";
import styles from "./CheckList.module.css";

/** 「오늘 볼 것 3」 — 시나리오 A/B를 가르는 관측 포인트 */
export function CheckList({ items }: { items: CheckItem[] }) {
  const shown = items.slice(0, 3);

  return (
    <section id="checklist" className="board-block focus-points" aria-labelledby="focus-title">
      <div className="block-head">
        <span className="step-no">3</span>
        <div>
          <h2 id="focus-title" className="block-head__title">
            오늘 볼 것 3
          </h2>
          <p className="block-head__sub">시나리오 A(기본) 유지 vs B(주의) — 눈으로 확인할 신호만</p>
        </div>
      </div>

      <ul className={styles.list}>
        {shown.map((item, i) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.no} aria-hidden>
              {i + 1}
            </span>
            <div className={styles.body}>
              <strong className={styles.text}>{toFocusTitle(item.text)}</strong>
              <p className={styles.why}>{item.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 과거 질문형 문구가 남아 있어도 제목처럼 읽히게 다듬음 */
function toFocusTitle(text: string): string {
  const trimmed = text.trim().replace(/\?+$/, "");
  if (/인가$|인지$|했는가$|정했는가$|있는가$|나는가$/.test(trimmed)) {
    return trimmed
      .replace(/인가$/, "")
      .replace(/인지$/, "")
      .replace(/했는가$/, "")
      .replace(/정했는가$/, "")
      .replace(/있는가$/, "")
      .replace(/나는가$/, "")
      .trim();
  }
  return trimmed;
}
