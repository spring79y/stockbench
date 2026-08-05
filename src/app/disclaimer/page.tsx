import type { Metadata } from "next";
import { LegalDocShell } from "@/components/LegalDocShell";

export const metadata: Metadata = {
  title: "면책 — Stock-Bench.com",
  description:
    "Stock-Bench.com은 투자 권유·매매 추천이 아닙니다. 참고용 브리핑에 대한 면책 안내.",
};

export default function DisclaimerPage() {
  return (
    <LegalDocShell title="면책">
      <p className="legal-doc__updated">최종 업데이트: 2026년 8월 5일</p>

      <h2>투자 권유 아님</h2>
      <p>
        Stock-Bench.com(증시 브리핑)이 제공하는 모든 콘텐츠—시장 온도, 브리핑, 시나리오,
        &ldquo;오늘 볼 것&rdquo;, 차트·지표 요약 포함—은 <strong>일반적인 정보·참고
        자료</strong>입니다. 특정 증권의 매수·매도·보유를 권유하거나, 투자 자문·일임을
        제공하지 않습니다. 투자 결정과 그에 따른 손익은 전적으로 이용자 본인의
        책임입니다.
      </p>

      <h2>데이터·시세</h2>
      <p>
        시세·지수·매크로·수급 등 수치는 Yahoo Finance, 네이버 금융 등 공개 자료를
        참고합니다. 지연·누락·오류가 있을 수 있으며, <strong>실시간 호가·주문·매매
        판단용으로 설계되지 않았습니다</strong>. 일부 화면에서는 수집 실패 시 임시
        데이터가 표시될 수 있습니다.
      </p>

      <h2>AI 생성 콘텐츠</h2>
      <p>
        브리핑·시나리오·점검 문구의 일부는 대규모 언어 모델(LLM)이 근거 자료를 바탕으로
        생성합니다. 자동 생성 문장은 사실 오류·과장·맥락 누락이 있을 수 있으므로, 중요한
        판단 전에는 원자료와 교차 확인하시기 바랍니다.
      </p>

      <h2>보장 없음</h2>
      <p>
        서비스는 정보의 정확성·완전성·적시성·특정 목적에의 적합성을 보장하지 않습니다.
        시장은 급변할 수 있으며, 과거·현재 관측이 미래 수익을 의미하지 않습니다.
      </p>

      <h2>책임의 한계</h2>
      <p>
        법령이 허용하는 최대 범위에서, 운영자는 서비스 이용 또는 이용 불능으로 인한
        직접·간접·특별·결과적 손해(투자 손실 포함)에 대해 책임지지 않습니다. 제3자
        사이트·데이터 제공자의 정책·오류에 대해서도 마찬가지입니다.
      </p>

      <h2>문의</h2>
      <p>
        면책·서비스 관련 문의:{" "}
        <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>
      </p>
    </LegalDocShell>
  );
}
