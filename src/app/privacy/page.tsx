import type { Metadata } from "next";
import { LegalDocShell } from "@/components/LegalDocShell";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — Stock-Bench.com",
  description: "Stock-Bench.com 개인정보 처리방침(초안).",
};

export default function PrivacyPage() {
  return (
    <LegalDocShell title="개인정보 처리방침">
      <p className="legal-doc__updated">최종 업데이트: 2026년 8월 5일</p>

      <h2>1. 개요</h2>
      <p>
        Stock-Bench.com(이하 &ldquo;서비스&rdquo;)은 일반적으로 회원 가입 없이 이용할 수
        있으며, 이름·연락처 등 직접 식별 가능한 개인정보를 회원가입 형태로 수집하지
        않습니다. 본 방침은 서비스 이용 과정에서 발생할 수 있는 정보 처리에 대해
        설명합니다.
      </p>

      <h2>2. 수집·이용 정보</h2>
      <ul>
        <li>
          <strong>문의 시</strong>: 이메일(
          <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>)로 연락하시면
          회신에 필요한 범위의 정보가 포함될 수 있습니다. 해당 정보는 문의 응대 목적
          외로 사용하지 않습니다.
        </li>
        <li>
          <strong>접속·이용 기록</strong>: 호스팅·보안을 위해 IP, 브라우저·기기 정보,
          요청 시각 등이 서버·인프라 로그에 남을 수 있습니다.
        </li>
        <li>
          <strong>분석</strong>: 방문·유입을 파악하기 위해{" "}
          <strong>Vercel Analytics</strong>를 사용할 수 있습니다. 앱 안에 별도 PV/UV
          카운터는 두지 않으며, 분석 도구가 쿠키 또는 유사 기술을 사용할 수 있습니다.
        </li>
      </ul>

      <h2>3. 쿠키</h2>
      <p>
        서비스는 필수 기능·성능·분석 목적으로 쿠키 또는 유사 기술을 사용할 수 있습니다.
        브라우저 설정에서 쿠키를 제한할 수 있으나, 일부 기능이 제한될 수 있습니다.
      </p>

      <h2>4. 제3자 제공·처리</h2>
      <p>
        법령에 따른 경우를 제외하고, 이용자 개인정보를 판매하거나 마케팅 목적으로
        제3자에게 제공하지 않습니다. 호스팅·분석 등 인프라 제공자(예: Vercel)가 서비스
        운영에 필요한 범위에서 데이터를 처리할 수 있습니다.
      </p>

      <h2>5. 보관</h2>
      <p>
        문의·로그·분석 데이터는 목적 달성 또는 관련 법령·운영상 필요한 기간 동안 보관한
        뒤 파기하거나 익명 처리합니다.
      </p>

      <h2>6. 이용자 권리</h2>
      <p>
        문의 과정에서 제공한 정보에 대해 열람·삭제 등을 요청할 수 있습니다.{" "}
        <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>으로 연락해 주세요.
      </p>

      <h2>7. 방침 변경</h2>
      <p>
        본 방침을 변경하면 서비스에 게시합니다. 게시한 날부터 효력이 발생합니다.
      </p>
    </LegalDocShell>
  );
}
