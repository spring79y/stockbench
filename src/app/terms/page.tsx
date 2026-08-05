import type { Metadata } from "next";
import { LegalDocShell } from "@/components/LegalDocShell";

export const metadata: Metadata = {
  title: "이용약관 — Stock-Bench.com",
  description: "Stock-Bench.com 서비스 이용약관(초안).",
};

export default function TermsPage() {
  return (
    <LegalDocShell title="이용약관">
      <p className="legal-doc__updated">최종 업데이트: 2026년 8월 5일</p>

      <h2>1. 목적</h2>
      <p>
        본 약관은 Stock-Bench.com(이하 &ldquo;서비스&rdquo;)의 이용 조건과 운영자·이용자 간
        권리·의무를 정합니다. 서비스를 이용하면 본 약관에 동의한 것으로 봅니다.
      </p>

      <h2>2. 서비스 내용</h2>
      <p>
        서비스는 한·미 시장에 관한 참고용 브리핑, 시나리오·점검 보조 자료, 공개 시세·지표
        요약을 제공합니다. 증권 매매 중개, 투자 일임, 투자 자문업을 하지 않습니다.
      </p>

      <h2>3. 이용</h2>
      <p>
        서비스는 일반적으로 별도의 회원 가입 없이 웹으로 이용할 수 있습니다. 운영자는
        서비스 개선·안정·법적 대응을 위해 기능을 변경·중단할 수 있으며, 가능한 범위에서
        안내합니다.
      </p>

      <h2>4. 금지 행위</h2>
      <ul>
        <li>서비스·콘텐츠를 무단으로 복제·배포·판매하거나 오인 유발에 이용하는 행위</li>
        <li>자동화된 대량 요청으로 시스템에 과도한 부하를 주는 행위</li>
        <li>법령·약관·타인의 권리를 침해하는 행위</li>
      </ul>

      <h2>5. 지적재산</h2>
      <p>
        서비스의 구성·디자인·브리핑 문구 등 운영자가 작성한 콘텐츠에 대한 권리는 운영자에게
        있습니다. 제3자 데이터·상표·로고의 권리는 각 권리자에게 있습니다.
      </p>

      <h2>6. 면책</h2>
      <p>
        서비스는 &ldquo;있는 그대로&rdquo; 제공되며, 정확성·완전성·적시성·특정 목적
        적합성을 보장하지 않습니다. 투자 손실 등 서비스 이용으로 인한 결과에 대해 법령이
        허용하는 범위에서 책임을 지지 않습니다. 자세한 내용은{" "}
        <a href="/disclaimer">면책</a>을 참고하세요.
      </p>

      <h2>7. 문의</h2>
      <p>
        약관·서비스 관련 문의:{" "}
        <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>
      </p>

      <h2>8. 약관 변경</h2>
      <p>
        약관을 개정할 경우 서비스에 게시합니다. 게시한 날부터 효력이 발생하며, 계속
        이용하면 변경 약관에 동의한 것으로 봅니다.
      </p>
    </LegalDocShell>
  );
}
