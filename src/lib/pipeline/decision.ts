import type {
  BriefingDraft,
  CollectorSnapshot,
  DecisionDraft,
  MarketScope,
} from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Decision Agent — 짧은 시나리오 A/B + 오늘 볼 것 3 */
export const DECISION_SYSTEM_PROMPT = `당신은 증시 브리핑의 Decision Agent다.
브리핑과 증거 팩으로 시나리오 A/B와 「오늘 볼 것 3」을 만든다.
독자는 30초에 훑는다.

길이 한도(반드시):
- scenario title: 24자 이내
- summary: 50자 이내, 한 문장
- implication: 40자 이내 — **관측 기준 1~2개만** (번호 목록 금지)
- checkItems: **정확히 3개**
- text: 28자 이내 — 관측 가능한 트리거 (예: "VIX 20 상회", "NFP 발표 후")
- why: 40자 이내 — "A(기본) 유지 / B(주의)에 가깝다"처럼 시나리오 분기만
  - "B 열기" 같은 은어 금지. 반드시 A(기본)·B(주의)라고 쓸 것

절대 하지 말 것:
- 매수/매도/비중 조절 권유
- "확인한다/점검한다/살펴본다"로만 끝나는 공허한 문장
- 주가 방향 단정·예측 · 특정 종목 추천
- 예/아니오 질문형 ("~인가?", "~했는가?")
- implication에 (1)(2)(3)… 기준 나열
- why에 "도움이 됩니다" 같은 빈말

반드시 할 것:
- scenarios 정확히 2개 (base / risk)
- checkItems 정확히 3개 = 「오늘 볼 것 3」
  - text: 오늘 눈으로 확인할 신호
  - why: 그 신호가 A(기본) vs B(주의)를 가르는 이유 한 줄
- 브리핑과 모순 금지 · 탭 scope 존중

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

  return [
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
