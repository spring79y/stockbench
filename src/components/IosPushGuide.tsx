"use client";

import Image from "next/image";
import { useState } from "react";
import { IOS_PUSH_GUIDE_STEPS } from "@/lib/push/iosPushGuideSteps";
import styles from "./IosPushGuide.module.css";

export function IosPushGuide({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const step = IOS_PUSH_GUIDE_STEPS[active];

  return (
    <section className={styles.panel} aria-label="iPhone 알림 켜는 방법">
      <div className={styles.head}>
        <p className={styles.title}>홈 화면에 추가한 뒤, 그 아이콘으로 열어 주세요.</p>
        <button type="button" className={styles.close} onClick={onClose}>
          닫기
        </button>
      </div>

      <div className={styles.stage}>
        <p className={styles.caption} aria-live="polite">
          <span className={styles.no}>{active + 1}</span>
          {step.caption}
        </p>
        <div className={styles.frame}>
          <Image
            key={step.src}
            className={styles.shot}
            src={step.src}
            alt={`${active + 1}단계: ${step.caption}`}
            width={471}
            height={1024}
            sizes="(max-width: 520px) calc(100vw - 72px), 360px"
            priority={active === 0}
          />
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.nav}
          disabled={active === 0}
          onClick={() => setActive((current) => Math.max(0, current - 1))}
        >
          이전
        </button>
        <div
          className={styles.dots}
          aria-label={`${active + 1} / ${IOS_PUSH_GUIDE_STEPS.length} 단계`}
        >
          {IOS_PUSH_GUIDE_STEPS.map((item, index) => (
            <button
              key={item.src}
              type="button"
              className={`${styles.dot} ${index === active ? styles.dotOn : ""}`}
              aria-label={`${index + 1}단계 보기`}
              aria-current={index === active ? "step" : undefined}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <button
          type="button"
          className={`${styles.nav} ${styles.navPrimary}`}
          disabled={active === IOS_PUSH_GUIDE_STEPS.length - 1}
          onClick={() =>
            setActive((current) =>
              Math.min(IOS_PUSH_GUIDE_STEPS.length - 1, current + 1),
            )
          }
        >
          다음
        </button>
      </div>
    </section>
  );
}
