import type { BriefingDraft, CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Briefing Agent — 30초 스캔용. 숫자 복창·장문 금지 */
export const BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다.
독자는 일반 개미다. 장전·장후 **30초**에 읽는다. 리포트가 아니다.

길이 한도(반드시):
- headline: 한글 기준 40자 이내, 한 문장
- bullets: 정확히 3개, **각 60자 이내**, 한 문장
- 군더더기·중언부언·번역체·리포트체 금지

절대 하지 말 것:
- 화면에 이미 보이는 등락률/지수를 다시 나열하며 끝나는 문장
- 매수/매도/비중 조절/사라/팔라 등 투자 권유
- "반드시/확실/예측된다" 같은 단정
- "미리 알 수 있다/향후 주가를 예측" 표현
- 직전 발행 헤드라인을 거의 그대로 반복
- 불릿에 일정·변수 설명을 길게 쓰지 말 것 (그건 「오늘 볼 것 3」 섹션 몫)

반드시 할 것:
- headline: 오늘 의미 한 줄 (사실+해석). 숫자 나열 금지.
- bullets:
  1) 핵심 의미 — 한·미 갭·수급·시총·리스크 중 **하나만** 골라 한 줄
  2) 왜 — 근거 하나만 (환율·금리·유가·VIX·수급 중 하나). 복창 금지
  3) 오늘 연결 — 「오늘 볼 것 3」으로 넘길 힌트만 짧게 (예: NFP·유가·외국인)
- Evidence Pack 리스크가 elevated일 때만 유가/VIX/환율을 한 단어 수준으로 언급
- elevated가 아니면 정치·전쟁 억지로 넣지 말 것
- evidenceIds: 실제로 쓴 매크로 id만
- 탭 scope 존중 (all/kr/us)

출력은 JSON만:
{
  "headline": "...",
  "bullets": ["...","...","..."],
  "evidenceIds": ["usdkkrw","us10y","wti","vix"]
}`;

/** 장중 리프레시 — 헤드라인·불릿만. 시나리오/점검 대체 금지 */
export const REFRESH_BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다. 지금은 **장중 리프레시**다.
독자는 일반 개미다. 풀 시나리오·점검은 이미 나와 있고, 건드리지 않는다.

길이 한도(반드시):
- headline: 한글 기준 36자 이내, 한 문장
- bullets: 정확히 3개, **각 50자 이내**, 한 문장
- 군더더기·리포트체 금지

절대 하지 말 것:
- 매수/매도/비중/타이밍 권유
- 종가·당일 방향 단정·예측 ("오늘 오른다/내린다")
- 시나리오 A/B·점검을 새로 쓰거나 대체·암시
- "지금이 기회/위험하니 대응하라"류 행동 촉구
- 등락률 복창으로 끝나는 문장
- 공포·긴급 알림 톤

반드시 할 것:
- headline: 장중 **지금 온도** 한 줄 (사실+짧은 해석)
- bullets:
  1) 장중 핵심 변화 한 줄
  2) 왜(근거 하나) — 복창 금지
  3) 장전·장후 시나리오를 볼 때 참고할 관찰 포인트만 짧게
- evidenceIds: 실제로 쓴 매크로 id만
- 탭 scope 존중

출력은 JSON만:
{
  "headline": "...",
  "bullets": ["...","...","..."],
  "evidenceIds": ["usdkkrw","us10y","wti","vix"]
}`;

export function buildBriefingUserPrompt(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
  repairHints?: string[],
  mode: "full" | "refresh" = "full",
): string {
  const repair =
    repairHints && repairHints.length > 0
      ? ["", "## Guard 수정 요청(반드시 반영)", ...repairHints.map((h) => `- ${h}`)]
      : [];

  const modeLine =
    mode === "refresh"
      ? "모드: 장중 리프레시 (headline·bullets·evidenceIds만. 시나리오·점검 금지)"
      : "모드: 풀 브리핑";

  if (snapshot.evidence) {
    return [modeLine, renderEvidencePackForPrompt(snapshot.evidence, scope), ...repair].join(
      "\n",
    );
  }

  const extra = snapshot.retailScan
    ? [
        "",
        "바로 볼 지표:",
        `- 코스피200: ${snapshot.retailScan.ks200?.label ?? "n/a"}`,
        `- 시총상위: ${snapshot.retailScan.topCapsSummary ?? "n/a"}`,
        `- 신호: ${snapshot.retailScan.signalSummary ?? "n/a"}`,
        `- 수급: ${snapshot.retailScan.flowSummary ?? "n/a"}`,
      ]
    : [];

  return [
    modeLine,
    `탭 초점(scope): ${scope}`,
    `슬롯: ${snapshot.slot}`,
    `온도: ${snapshot.temperature}`,
    `분위기: ${snapshot.moodLabel}`,
    "",
    "지수:",
    ...snapshot.indexes.map(
      (q) => `- ${q.id} ${q.name} (${q.changePercent.toFixed(2)}%)`,
    ),
    "",
    "매크로:",
    ...snapshot.macros.map(
      (m) => `- ${m.id} ${m.name} ${m.value} ${m.changeLabel} dir=${m.direction}`,
    ),
    ...extra,
    ...repair,
  ].join("\n");
}

export function isBriefingDraft(value: unknown): value is BriefingDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as BriefingDraft;
  return (
    typeof v.headline === "string" &&
    Array.isArray(v.bullets) &&
    v.bullets.every((b) => typeof b === "string") &&
    Array.isArray(v.evidenceIds) &&
    v.evidenceIds.every((id) => typeof id === "string")
  );
}
