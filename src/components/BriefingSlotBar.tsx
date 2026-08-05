"use client";

import type { MarketScope } from "@/lib/market/scope";
import type { PipelineMode, PipelineSlot } from "@/lib/pipeline/types";
import { nextSlotForScope, SLOT_SCHEDULE } from "@/lib/pipeline/schedule";
import { PushOptIn } from "@/components/PushOptIn";
import styles from "./BriefingSlotBar.module.css";

const SLOT_LABEL: Partial<Record<PipelineSlot, string>> = Object.fromEntries(
  (Object.keys(SLOT_SCHEDULE) as PipelineSlot[]).map((id) => [id, SLOT_SCHEDULE[id].label]),
);

export function BriefingSlotBar({
  scope,
  slot,
  mode,
  changeLines,
}: {
  scope: MarketScope;
  slot?: PipelineSlot | null;
  mode?: PipelineMode | null;
  changeLines?: string[];
}) {
  if (scope === "all") return null;

  const next = nextSlotForScope(scope);
  const slotLabel = slot ? (SLOT_LABEL[slot] ?? slot) : null;
  const isRefresh = mode === "refresh";
  const lines = (changeLines ?? []).slice(0, 3);

  return (
    <section className={styles.bar} aria-label="브리핑 슬롯 안내">
      <div className={styles.row}>
        <p className={styles.now}>
          {slotLabel ? (
            <>
              이번 브리핑 · <strong>{slotLabel}</strong>
              {isRefresh ? <span className={styles.tag}>헤드라인만 갱신</span> : null}
            </>
          ) : (
            "이번 브리핑 슬롯 정보 없음"
          )}
        </p>
        {next ? (
          <p className={styles.next}>
            다음 발행 · {next.label} <time>{next.whenLabel}</time>
            {next.mode === "refresh" ? (
              <span className={styles.tagMuted}>헤드라인만</span>
            ) : null}
          </p>
        ) : null}
      </div>
      {lines.length > 0 ? (
        <div className={styles.delta}>
          <p className={styles.deltaLabel}>직전 발행 대비</p>
          <ul className={styles.deltaList}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <PushOptIn scope={scope} />
    </section>
  );
}
