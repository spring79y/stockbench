"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./IosPushGuide.module.css";

type GuideStep = {
  src: string;
  caption: string;
  /** 눌러야 할 위치 (스크린샷 대비 %) */
  hotspot: { left: number; top: number; width: number; height: number };
  /** 화살표를 하이라이트 위/아래 중 어디에 둘지 */
  arrow: "above" | "below";
};

const STEPS: GuideStep[] = [
  {
    src: "/guide/ios-push/1-menu.png",
    caption: "Safari 메뉴에서 공유",
    hotspot: { left: 36, top: 58.4, width: 62, height: 5 },
    arrow: "above",
  },
  {
    src: "/guide/ios-push/2-share.png",
    caption: "홈 화면에 추가",
    hotspot: { left: 7.5, top: 58.4, width: 89, height: 5 },
    arrow: "above",
  },
  {
    src: "/guide/ios-push/3-add.png",
    caption: "추가 누르기",
    hotspot: { left: 79.5, top: 10.4, width: 16.5, height: 5.4 },
    arrow: "below",
  },
  {
    src: "/guide/ios-push/4-allow.png",
    caption: "아이콘으로 열고 알림 허용",
    hotspot: { left: 50.5, top: 57.3, width: 34, height: 5.6 },
    arrow: "above",
  },
];

export function IosPushGuide({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  const arrowStyle =
    step.arrow === "above"
      ? {
          left: `${step.hotspot.left + step.hotspot.width / 2}%`,
          bottom: `${100 - step.hotspot.top + 0.8}%`,
        }
      : {
          left: `${step.hotspot.left + step.hotspot.width / 2}%`,
          top: `${step.hotspot.top + step.hotspot.height + 0.8}%`,
        };

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
          />
          <span
            className={styles.hotspot}
            style={{
              left: `${step.hotspot.left}%`,
              top: `${step.hotspot.top}%`,
              width: `${step.hotspot.width}%`,
              height: `${step.hotspot.height}%`,
            }}
            aria-hidden
          />
          <span
            className={`${styles.arrow} ${
              step.arrow === "above" ? styles.arrowDown : styles.arrowUp
            }`}
            style={arrowStyle}
            aria-hidden
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
        <div className={styles.dots} aria-label={`${active + 1} / ${STEPS.length} 단계`}>
          {STEPS.map((item, index) => (
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
          disabled={active === STEPS.length - 1}
          onClick={() =>
            setActive((current) => Math.min(STEPS.length - 1, current + 1))
          }
        >
          다음
        </button>
      </div>
    </section>
  );
}
