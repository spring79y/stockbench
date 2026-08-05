"use client";

import Image from "next/image";
import styles from "./IosPushGuide.module.css";

const STEPS = [
  { src: "/guide/ios-push/1-menu.png", caption: "Safari 메뉴 열기" },
  { src: "/guide/ios-push/2-share.png", caption: "홈 화면에 추가" },
  { src: "/guide/ios-push/3-add.png", caption: "추가 누르기" },
  { src: "/guide/ios-push/4-allow.png", caption: "아이콘으로 열고 허용" },
];

export function IosPushGuide({ onClose }: { onClose: () => void }) {
  return (
    <section className={styles.panel} aria-label="iPhone 알림 켜는 방법">
      <div className={styles.head}>
        <p className={styles.title}>홈 화면에 추가한 뒤, 그 아이콘으로 열어 주세요.</p>
        <button type="button" className={styles.close} onClick={onClose}>
          닫기
        </button>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.src} className={styles.step}>
            <p className={styles.caption}>
              <span className={styles.no}>{index + 1}</span>
              {step.caption}
            </p>
            <Image
              className={styles.shot}
              src={step.src}
              alt={step.caption}
              width={471}
              height={1024}
              sizes="150px"
              loading="lazy"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
