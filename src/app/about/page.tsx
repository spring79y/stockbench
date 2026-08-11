import type { Metadata } from "next";
import { AboutPushGuide } from "@/components/AboutPushGuide";
import { LegalDocShell } from "@/components/LegalDocShell";

export const metadata: Metadata = {
  title: "소개 — Stock-Bench.com",
  description:
    "Stock-Bench.com의 브리핑 갱신 시간, 웹 푸시 알림, iPhone 알림 설정 방법을 안내합니다.",
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

      <h2>브리핑이 언제 갱신되나요?</h2>
      <p>
        한·미 각각 장전·장중·장후 풀 브리핑에 더해, <strong>12:30</strong>에는 미국 탭용{" "}
        <strong>미국 점검</strong>도 함께 갱신됩니다(평일 자동 최대 6창, 주말·휴장일 스킵 가능). 미국
        장중(`us-mid`)은 자동 스케줄에 없고 필요 시만 수동 발행합니다. 시각은 한국 시간(KST)
        기준입니다.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">슬롯</th>
            <th scope="col">시각</th>
            <th scope="col">초점</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>미국 장후 · 한국 장전</td>
            <td>07:00</td>
            <td>미 마감 리캡 후, 국내 전일 요약 + 오늘 관측 틀</td>
          </tr>
          <tr>
            <td>미국 점검 · 한국 장중</td>
            <td>12:30</td>
            <td>미국 장후~장전 공백 점검 + 한국 오전 소화·오후 관측</td>
          </tr>
          <tr>
            <td>한국 장후</td>
            <td>15:40</td>
            <td>국내 세션 결과·수급·시총 리캡</td>
          </tr>
          <tr>
            <td>미국 장전</td>
            <td>21:50</td>
            <td>미 전일 요약 + 오늘 미국 관측 틀</td>
          </tr>
        </tbody>
      </table>
      <p>
        장중·점검 풀은 <strong>관측 틀을 다시 맞추는 것</strong>이지, 매매 신호나 개장 방향 예측이
        아닙니다. 12:30 미국 점검은 미 정규장 중이 아니며, 직전 미 세션·오버나잇과 저녁 장전
        관측에 초점을 둡니다. 시세 숫자는 화면에서 별도로 실시간 참고할 수 있습니다.
      </p>

      <h2>브리핑 알림이란?</h2>
      <p>
        한국·미국 탭의 <strong>알림 받기</strong>로, 선택한 시장·슬롯의 브리핑이 발행될 때
        웹 푸시를 받을 수 있습니다. <strong>시세 급등락·속보 알림이 아닙니다.</strong>
      </p>
      <ul>
        <li>시장(한국/미국)과 슬롯(장전·장중·장후)을 골라 받을 수 있습니다.</li>
        <li>
          <strong>밤 12시–오전 7시(KST)</strong>에는 알림을 보내지 않습니다. 이 시간대에 수동으로
          발행된 분도 푸시 없이 사이트에서만 확인합니다.
        </li>
        <li>07:00 미국 장후·한국 장전 알림은 quiet hours 이후라 발송됩니다.</li>
      </ul>

      <h2>알림 켜는 방법</h2>
      <h3>Android · Chrome</h3>
      <p>
        사이트를 Chrome으로 연 뒤 브리핑 블록의 <strong>알림 받기</strong>를 누르고, 브라우저
        권한 창에서 허용하면 됩니다. 막혀 있으면 주소창 자물쇠 → 사이트 설정 → 알림 허용 후
        다시 시도하세요.
      </p>

      <h3>iPhone · iPad (Safari)</h3>
      <p>
        iOS는 일반 Safari 탭에서는 웹 푸시가 제한됩니다.{" "}
        <strong>홈 화면에 추가한 뒤, 그 아이콘으로 앱처럼 열어</strong> 알림을 켜야 합니다.
        아래 순서(빨간 표시가 눌 곳)를 따라 주세요.
      </p>
      <AboutPushGuide />
      <ol>
        <li>Safari에서 이 사이트를 연 뒤, 하단·메뉴에서 <strong>공유</strong>를 엽니다.</li>
        <li>
          공유 시트에서 <strong>홈 화면에 추가</strong>를 고릅니다. (목록에 없으면 아래로
          스크롤)
        </li>
        <li>오른쪽 위 <strong>추가</strong>를 눌러 홈 화면 아이콘을 만듭니다.</li>
        <li>
          Safari 탭이 아니라 <strong>홈 화면 아이콘</strong>으로 사이트를 다시 연 뒤,{" "}
          <strong>알림 받기</strong> → 시스템 창에서 <strong>허용</strong>을 누릅니다.
        </li>
      </ol>
      <p>
        홈에서도 같은 안내를 볼 수 있습니다. iPhone에서 「알림 받기」를 누르면 단계별
        스크린샷이 바로 열립니다.
      </p>

      <h2>문의</h2>
      <p>
        <a href="mailto:spring79y@gmail.com">spring79y@gmail.com</a>
      </p>
    </LegalDocShell>
  );
}
