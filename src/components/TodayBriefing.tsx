"use client";

import type { DailyBriefing, MacroChip } from "@/lib/types";
import type { MarketScope } from "@/lib/market/scope";
import type { PipelineMode, PipelineSlot } from "@/lib/pipeline/types";
import { nextSlotForScope, SLOT_SCHEDULE } from "@/lib/pipeline/schedule";
import { changeToneClass } from "@/lib/format";
import { PushOptIn } from "@/components/PushOptIn";
import styles from "./TodayBriefing.module.css";

const SLOT_LABEL: Partial<Record<PipelineSlot, string>> = Object.fromEntries(
  (Object.keys(SLOT_SCHEDULE) as PipelineSlot[]).map((id) => [id, SLOT_SCHEDULE[id].label]),
);

export function TodayBriefing({
  briefing,
  macros,
  updatedLabel,
  fromPipeline,
  refreshLabel,
  scope,
  slot,
  publishedAt,
  mode,
}: {
  briefing: DailyBriefing;
  macros: MacroChip[];
  updatedLabel?: string;
  fromPipeline?: boolean;
  /** 장중 리프레시일 때 짧은 라벨 */
  refreshLabel?: boolean;
  scope?: MarketScope;
  slot?: PipelineSlot | null;
  /** ISO — 당일 미발행 noon 등을 다음 슬롯으로 유지할 때 사용 */
  publishedAt?: string | null;
  mode?: PipelineMode | null;
}) {
  const evidenceIdSet = new Set(briefing.evidenceIds);
  const chips = [
    ...macros.filter((m) => evidenceIdSet.has(m.id)),
    ...macros.filter((m) => !evidenceIdSet.has(m.id)),
  ];

  const marketScope = scope === "kr" || scope === "us" ? scope : null;
  const next = marketScope
    ? nextSlotForScope(
        marketScope,
        new Date(),
        slot && publishedAt ? { slot, publishedAt } : null,
      )
    : null;
  const slotLabel = slot ? (SLOT_LABEL[slot] ?? slot) : null;
  const isRefresh = mode === "refresh" || Boolean(refreshLabel);

  return (
    <section id="briefing" className="board-block briefing" aria-labelledby="briefing-title">
      <div className="block-head">
        <span className="step-no">1</span>
        <div className={styles.headBody}>
          <h2 id="briefing-title" className="block-head__title">
            오늘의 브리핑
          </h2>
          <p className="block-head__sub">
            {slotLabel ? (
              <>
                이번 브리핑 · <strong className={styles.slotStrong}>{slotLabel}</strong>
              </>
            ) : updatedLabel ? (
              <>
                {isRefresh ? "장중 리프레시" : "가장 최근 업데이트"}
              </>
            ) : (
              "슬롯 정보 없음"
            )}
            {updatedLabel ? (
              <>
                {" · "}
                {updatedLabel}
              </>
            ) : null}
            {fromPipeline === false ? " · 목 데이터" : null}
            {isRefresh ? <span className={styles.tag}>헤드라인만 갱신</span> : null}
          </p>
          {next ? (
            <p className={styles.nextLine}>
              다음 브리핑 · {next.label}{" "}
              <time dateTime={next.whenLabel}>{next.whenLabel}</time>
              {next.mode === "refresh" ? (
                <span className={styles.tagMuted}>헤드라인만</span>
              ) : null}
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

      {chips.length > 0 ? (
        <div className={styles.evidence}>
          <p className={styles.evidenceLabel}>근거 지표</p>
          <div className={styles.chips}>
            {chips.map((chip) => (
              <div key={chip.id} className={styles.chip}>
                <span className={styles.chipName}>{chip.name}</span>
                <span className={styles.chipValue}>{chip.value}</span>
                <span className={`${styles.chipChange} ${changeToneClass(chip.direction)}`}>
                  {chip.changeLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {marketScope ? <PushOptIn scope={marketScope} /> : null}
    </section>
  );
}
