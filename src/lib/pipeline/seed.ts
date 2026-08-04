import type { BriefingDraft, CollectorSnapshot, DecisionDraft, MarketScope } from "@/lib/pipeline/types";

/** LLM 실패 시 — 복창 없이 해석 톤 유지 */
export function seedBriefing(snapshot: CollectorSnapshot, scope: MarketScope): BriefingDraft {
  const kospi = snapshot.indexes.find((q) => q.id === "kospi");
  const nasdaq = snapshot.indexes.find((q) => q.id === "nasdaq");
  const fx = snapshot.macros.find((m) => m.id === "usdkkrw");
  const wti = snapshot.macros.find((m) => m.id === "wti");
  const riskElevated = Boolean(snapshot.evidence?.risk?.elevated);
  const riskHint = snapshot.evidence?.risk?.headlines[0]?.title;
  const sharp = (kospi?.changePercent ?? 0) <= -3;
  const usUp = (nasdaq?.changePercent ?? 0) >= 0.3;

  const riskBullet = riskElevated
    ? riskHint
      ? `지정학·공급 리스크 헤드라인(예: ${riskHint})이 잡혀 있으면, 유가(${wti?.value ?? "WTI"})·VIX와 같이 ‘흔들림 원인 후보’로만 보세요. 전쟁 결과 예측은 하지 마세요.`
      : "유가·변동성 숫자가 흔들릴 때는 중동·공급 같은 지정학 리스크가 원인 후보일 수 있습니다. 단정하지 말고 점검 포인트로만 두세요."
    : null;

  if (scope === "kr") {
    return {
      headline: sharp
        ? "국내가 크게 흔들린 날 — ‘종목’보다 ‘시장 온도·대형주’부터"
        : "국내 중심 점검 — 환율·대형주 온도를 같이 보세요",
      bullets: [
        sharp
          ? "지수가 크게 움직인 날에는 개별 이슈보다, 시총 상위와 코스피200이 같이 밀렸는지가 체감 차이를 만듭니다."
          : "한국 탭에서는 미국 숫자 나열보다, 국내 지수와 시총 상위가 같은 방향인지부터 보면 덜 헷갈립니다.",
        riskBullet ??
          (fx?.direction === "down"
            ? "원/달러가 내린 날(원화 상대 강세)에는 수출주·수급 이야기가 자주 붙습니다. 단정하지 말고 ‘내 보유가 환율에 얼마나 민감한지’만 보세요."
            : "환율·금리 중 무엇이 더 빨리 변했는지가, 오늘 분위기 해석의 실마리가 되는 경우가 많습니다."),
        "야간·파생으로 내일을 ‘예측’하진 마세요. 코스피200·변동성 온도는 ‘경계가 커졌는지’ 점검용입니다.",
      ],
      evidenceIds: riskElevated ? ["usdkkrw", "wti", "vix"] : ["usdkkrw", "us10y", "vix"],
    };
  }

  if (scope === "us") {
    return {
      headline: usUp
        ? "미국은 상대적으로 덜 아픈 흐름 — 금리·변동성이 변수"
        : "미국 온도 점검 — 국내와 방향을 섞지 마세요",
      bullets: [
        "미국 탭의 1순위는 미 지수·금리·VIX입니다. 한국 급락을 그대로 가져와 해석하면 초점이 흐려집니다.",
        riskBullet ??
          "금리가 같이 움직이면 성장주 체감이 달라질 수 있으니, ‘올랐다/떨어졌다’보다 금리 방향을 같이 보세요.",
        "이번 주 고용·물가 일정이 있으면 방향 맞히기보다 발표 전후 흔들림에 대비하는 편이 덜 다칩니다.",
      ],
      evidenceIds: ["us10y", "vix", "wti"],
    };
  }

  return {
    headline:
      sharp && usUp
        ? "한·미 온도가 갈린 날 — ‘왜 다른지’가 오늘의 핵심"
        : "한·미를 한눈에 — 공통 변수(환율·금리)부터",
    bullets: [
      sharp && usUp
        ? "국내가 밀고 미국이 버티면, 글로벌 한파만으로 설명하기 어렵습니다. 시총 상위·코스피200이 지수와 같이 움직였는지 보세요."
        : "통합 탭에서는 한·미 등락을 나열하기보다, 같은 방향인지 다른 방향인지를 먼저 나누는 게 도움이 됩니다.",
      riskBullet ??
        `원/달러 ${fx?.value ?? "-"} 흐름과 미 금리를 같이 보면, ‘국내만의 이슈’인지 ‘공통 변수’인지 가늠하기 쉽습니다.`,
      "선물·옵션으로 내일을 맞히려 하지 마세요. VIX·코스피200 온도는 기대·경계 신호일 뿐입니다.",
    ],
    evidenceIds: riskElevated ? ["usdkkrw", "wti", "vix"] : ["usdkkrw", "us10y", "vix"],
  };
}

export function seedDecision(snapshot: CollectorSnapshot, scope: MarketScope): DecisionDraft {
  const kospi = snapshot.indexes.find((q) => q.id === "kospi");
  const sharpDrop = (kospi?.changePercent ?? 0) <= -3;
  const riskElevated = Boolean(snapshot.evidence?.risk?.elevated);

  return {
    scenarios: [
      {
        id: "base",
        label: "A · 기본",
        title: sharpDrop ? "급변 후 숨 고르기" : "혼조 속 관망",
        summary: sharpDrop
          ? "큰 움직임 뒤에는 ‘추가 하락 확정’보다 변동성 구간으로 읽는 경우가 많습니다."
          : "한·미가 크게 안 어긋나면 환율·금리 같은 공통 변수로 나누는 편이 낫습니다.",
        implication:
          "체감≠지수인지, 환율·금리 중 무엇이 더 움직였는지로 나눕니다.",
      },
      {
        id: "risk",
        label: "B · 경계",
        title: riskElevated ? "지정학·변동성 경계" : "추가 흔들림 경계",
        summary: riskElevated
          ? "유가·VIX가 같이 움직이면 방향보다 흔들림을 먼저 봅니다."
          : "환율·금리가 더 튀면 성장주·심리에 부담이 커질 수 있습니다.",
        implication: "보유가 환율·금리·유가에 얼마나 민감한지만 봅니다.",
      },
    ],
    checkItems: [
      {
        id: "horizon",
        text: "오늘 판단의 시간 범위",
        why: "단기·중기를 섞으면 같은 뉴스도 해석이 갈립니다.",
      },
      {
        id: "driver",
        text:
          scope === "us" ? "미국 민감 변수 1개" : "국내·매크로 민감 변수 1개",
        why: "하나만 고르면 A/B 분기가 선명해집니다.",
      },
      {
        id: "other",
        text: riskElevated ? "유가·VIX 동반 급변" : "상대 시장은 보조로만",
        why: riskElevated
          ? "동반 급변이면 B(주의) 쪽을 더 엽니다."
          : "초점이 흐리면 브리핑이 도움이 안 됩니다.",
      },
    ],
  };
}
