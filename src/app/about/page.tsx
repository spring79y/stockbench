import type { Metadata } from "next";
import { LegalDocShell } from "@/components/LegalDocShell";

export const metadata: Metadata = {
  title: "소개 — Stock-Bench.com",
  description:
    "Stock-Bench.com은 한·미 시장을 알기 쉽게 간추린 참고용 브리핑 서비스입니다.",
};

export default function AboutPage() {
  return (
    <LegalDocShell title="소개">
      <p>
        <strong>Stock-Bench.com</strong>(증시 브리핑)은 대부분의 개인 투자자가 반드시 알아야
        할 한·미 시장 정보를 알기 쉽게 간추려 보여주는 참고용 브리핑 서비스입니다.
      </p>
      <p>
        홈에서는 <strong>증시개요</strong>·<strong>한국</strong>·<strong>미국</strong> 탭으로
        시장을 나눠 봅니다. 개요는 지수·매크로·짧은 브리핑·일정·속보를 한눈에, 한·미 탭은
        시장 온도부터 브리핑·시나리오·오늘 볼 것까지 흐름을 따라갑니다.
      </p>
      <p>
        숫자는 공개 시세·지표를 모으고, 해설은 AI(LLM)가 근거 기반으로 작성합니다. 매수·매도
        추천이나 종목 포트폴리오 제안은 하지 않습니다. 시나리오와 점검은 의사결정을 돕기
        위한 보조 자료일 뿐, 투자 자문이 아닙니다.
      </p>
      <p>
        문의:{" "}
        <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>
      </p>
    </LegalDocShell>
  );
}
