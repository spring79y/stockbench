import Image from "next/image";
import { IOS_PUSH_GUIDE_STEPS } from "@/lib/push/iosPushGuideSteps";
import styles from "./AboutPushGuide.module.css";

/** 소개 페이지용 — iOS 알림 설정 단계를 스크린샷과 함께 순서대로 안내 */
export function AboutPushGuide() {
  return (
    <ol className={styles.list}>
      {IOS_PUSH_GUIDE_STEPS.map((step, index) => (
        <li key={step.src} className={styles.item}>
          <p className={styles.caption}>
            <span className={styles.no}>{index + 1}</span>
            {step.caption}
          </p>
          <Image
            className={styles.shot}
            src={step.src}
            alt={`${index + 1}단계: ${step.caption}`}
            width={471}
            height={1024}
            sizes="(max-width: 520px) calc(100vw - 48px), 280px"
          />
        </li>
      ))}
    </ol>
  );
}
