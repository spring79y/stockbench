"use client";

import { useEffect, useState } from "react";
import type { CheckItem } from "@/lib/types";
import type { MarketScope } from "@/lib/market/scope";
import styles from "./CheckList.module.css";

function storageKey(scope: MarketScope, issuedAt: string | null | undefined, id: string) {
  return `sb-check:${scope}:${issuedAt ?? "none"}:${id}`;
}

/** 「오늘 볼 것」 — 시나리오 A/B를 가르는 관측 포인트 (로컬 체크) */
export function CheckList({
  items,
  scope = "kr",
  issuedAt,
}: {
  items: CheckItem[];
  scope?: MarketScope;
  issuedAt?: string | null;
}) {
  const shown = items.slice(0, 5);
  const shownKey = shown.map((i) => i.id).join("|");
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of shown) {
      try {
        next[item.id] = window.localStorage.getItem(storageKey(scope, issuedAt, item.id)) === "1";
      } catch {
        next[item.id] = false;
      }
    }
    setDone(next);
  }, [scope, issuedAt, shownKey]);

  const toggle = (id: string) => {
    setDone((prev) => {
      const value = !prev[id];
      try {
        window.localStorage.setItem(storageKey(scope, issuedAt, id), value ? "1" : "0");
      } catch {
        // ignore quota / private mode
      }
      return { ...prev, [id]: value };
    });
  };

  return (
    <section id="checklist" className="board-block focus-points" aria-labelledby="focus-title">
      <div className="block-head">
        <span className="step-no">3</span>
        <div>
          <h2 id="focus-title" className="block-head__title">
            오늘 볼 것
          </h2>
          <p className="block-head__sub">
            시나리오 A(기본) 유지 vs B(주의) — 눈으로 확인할 신호만 · 이 기기에서만 체크 유지
          </p>
        </div>
      </div>

      <ul className={styles.list}>
        {shown.map((item, i) => {
          const checked = Boolean(done[item.id]);
          return (
            <li key={item.id} className={`${styles.item} ${checked ? styles.itemDone : ""}`}>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  onChange={() => toggle(item.id)}
                />
                <span className={styles.no} aria-hidden>
                  {i + 1}
                </span>
                <span className={styles.body}>
                  <strong className={styles.text}>{toFocusTitle(item.text)}</strong>
                  <span className={styles.why}>{item.why}</span>
                </span>
              </label>
            </li>
          );
        })}
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
