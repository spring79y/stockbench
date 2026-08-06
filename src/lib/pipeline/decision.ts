import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  MarketScope,
} from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Decision Agent — 짧은 시나리오 A/B + 오늘 볼 것(최대 5) */
export const DECISION_SYSTEM_PROMPT = `당신은 증시 브리핑의 Decision Agent다.
브리핑과 증거 팩으로 시나리오 A/B와 「오늘 볼 것」을 만든다.
독자는 30초에 훑는다.

길이 한도(반드시):
- scenario title: 24자 이내
- summary: 50자 이내, 한 문장
- implication: 40자 이내 — **관측 기준 1~2개만** (번호 목록 금지)
- checkItems: **3~5개** (최대 5)
- text: 28자 이내 — 관측 가능한 트리거 (예: "VIX 20 상회", "NFP 발표 후")
- why: 40자 이내 — "A(기본) 유지 / B(주의)에 가깝다"처럼 시나리오 분기만
  - "B 열기" 같은 은어 금지. 반드시 A(기본)·B(주의)라고 쓸 것

절대 하지 말 것:
- 매수/매도/비중 조절 권유
- "확인한다/점검한다/살펴본다"로만 끝나는 공허한 문장
- 주가 방향 단정·예측 · 특정 종목 추천
- 장전 슬롯에서 전 거래일 마감·수급·시총 수치를 오늘 개장 예측처럼 쓰기
- 장전 슬롯에서 "출발 예고/예상/전망", "강세/약세 출발" 표현
- 예/아니오 질문형 ("~인가?", "~했는가?")
- implication에 (1)(2)(3)… 기준 나열
- why에 "도움이 됩니다" 같은 빈말

반드시 할 것:
- scenarios 정확히 2개 (base / risk)
- checkItems 3~5개 = 「오늘 볼 것」
  - text: 오늘 눈으로 확인할 신호
  - why: 그 신호가 A(기본) vs B(주의)를 가르는 이유 한 줄
- 브리핑과 모순 금지 · 탭 scope 존중 (us면 미장 중심, kr면 국내 중심. 상대 시장은 시나리오에서도 보조만)

출력 JSON만:
{
  "scenarios": [
    { "id":"base", "label":"A · 기본", "title":"...", "summary":"...", "implication":"..." },
    { "id":"risk", "label":"B · 주의", "title":"...", "summary":"...", "implication":"..." }
  ],
  "checkItems": [
    { "id":"c1", "text":"...", "why":"..." },
    { "id":"c2", "text":"...", "why":"..." },
    { "id":"c3", "text":"...", "why":"..." }
  ]
}`;

export function buildDecisionUserPrompt(
  snapshot: CollectorSnapshot,
  briefing: BriefingDraft,
  scope: MarketScope,
  repairHints?: string[],
): string {
  const repair =
    repairHints && repairHints.length > 0
      ? ["", "## Guard 수정 요청(반드시 반영)", ...repairHints.map((h) => `- ${h}`)]
      : [];

  const evidenceBlock = snapshot.evidence
    ? renderEvidencePackForPrompt(snapshot.evidence, scope)
    : [
        `온도: ${snapshot.temperature}`,
        "지수:",
        ...snapshot.indexes.map((q) => `- ${q.name} ${q.changePercent.toFixed(2)}%`),
        "매크로:",
        ...snapshot.macros.map((m) => `- ${m.name} ${m.value} ${m.changeLabel}`),
      ].join("\n");

  const temporalHard =
    snapshot.slot === "kr-pre" || snapshot.slot === "us-pre"
      ? [
          "## 장전 시점 하드 규칙",
          "- 전일 요약에는 Evidence **전일세션마감** 숫자만 쓴다. 장중/프리 숫자를 전일로 쓰지 말 것.",
          "- 전일 마감·수급·시총 수치는 과거 사실일 뿐 오늘 개장 예측이 아니다.",
          "- 해당 숫자를 쓰면 같은 문장에 '전일/전 거래일/직전 마감/마감 기준'을 명시한다.",
          "- 출발 예고/예상/전망, 개장 예상, 강세/약세 출발 표현은 금지한다.",
        ].join("\n")
      : "";
  const slotDecisionRule =
    snapshot.slot === "kr-pre" || snapshot.slot === "us-pre"
      ? [
          "## 장전 관측 분기 규칙",
          "- A/B는 같은 관측 신호가 유지될 때와 깨질 때의 온도·체감으로 나눈다. 개장 방향 예측 금지.",
          "- checkItems는 브리핑의 관측 신호와 같은 구체 트리거(유지 여부·반응·상회/하회·전환)를 사용한다.",
          "- why는 A(기본) 유지 / B(주의)에 가깝다는 조건부 해석만 쓴다.",
        ].join("\n")
      : snapshot.slot === "kr-post" || snapshot.slot === "us-post"
        ? [
            "## 장후 분기 규칙",
            "- 오늘 세션 결과와 촉발 요인을 기준점으로 삼는다.",
            "- 다음 세션은 방향 단정 없이 남은 일정·금리·환율·변동성 반응을 관측 신호로 둔다.",
          ].join("\n")
        : "";

  return [
    temporalHard,
    slotDecisionRule,
    "## 오늘 브리핑 (이미 확정된 해석 — 모순 금지)",
    `헤드라인: ${briefing.headline}`,
    "불릿:",
    ...briefing.bullets.map((b) => `- ${b}`),
    "",
    evidenceBlock,
    ...repair,
  ].join("\n");
}

export function isDecisionDraft(value: unknown): value is DecisionDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as DecisionDraft;
  if (!Array.isArray(v.scenarios) || !Array.isArray(v.checkItems)) return false;
  return (
    v.scenarios.every(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.label === "string" &&
        typeof s.title === "string" &&
        typeof s.summary === "string" &&
        typeof s.implication === "string",
    ) &&
    v.checkItems.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.text === "string" &&
        typeof c.why === "string",
    )
  );
}
