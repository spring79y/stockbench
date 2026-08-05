import type { BriefingDraft, CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Briefing Agent — 한국/미국 탭. 숫자 복창·장문 금지, 밀도는 개요보다 깊게·구체적으로 */
export const BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다.
독자는 일반 개미다. 한국·미국 **탭 본문**용이다. 개요 한눈 요약보다 **구체적**으로 쓴다. 리포트·에세이는 아니다.

길이 한도(반드시):
- headline: 한글 기준 56자 이내, 한 문장 — 오늘 **무슨 일·무슨 온도**인지 한눈에
- bullets: **4~5개**, 각 **100자 이내**, 한 문장
- 군더더기·중언부언·번역체·리포트체 금지

절대 하지 말 것:
- 화면에 이미 보이는 등락률/지수를 다시 나열하며 끝나는 문장 ("코스피 +1.2%"만 반복)
- 매수/매도/비중 조절/사라/팔라 등 투자 권유
- "반드시/확실/예측된다" 같은 단정
- "미리 알 수 있다/향후 주가를 예측" 표현
- 직전 발행 헤드라인을 거의 그대로 반복
- "시장이 주목한다/변동성이 커질 수 있다"처럼 **누가·무엇이·왜**가 빠진 공허한 문장

반드시 할 것:
- headline: 사실(세션·이벤트·수급·갭 중 하나) + 짧은 해석. 숫자 나열 금지.
- bullets (가능하면 4~5개 채움):
  1) **핵심 사실** — 오늘 이 탭 시장에서 실제로 일어난/진행 중인 일 한 줄 (수급·시총 쏠림·갭·일정 등 Evidence Pack에서 고름)
  2) **왜** — 근거 하나 (환율·금리·유가·VIX·외국인/기관·상대 시장). 복창 금지, 인과를 짧게
  3) **체감** — 시총 상위·섹터·한·미 온도 차이 등 개미가 느끼는 포인트 한 줄
  4) **일정·세션 연결** — 앞뒤 장·발표가 있으면 구체적으로 이름 붙이기 (예: NFP, 옵션만기)
  5) **관찰 힌트** — 「오늘 볼 것」으로 넘길 관측 포인트 한 줄
- Evidence Pack 리스크가 elevated일 때만 유가/VIX/환율을 짧게 언급
- elevated가 아니면 정치·전쟁 억지로 넣지 말 것
- evidenceIds: 실제로 쓴 매크로 id만
- 탭 scope 존중 (kr/us). kr면 국내 중심, us면 미장 중심.

출력은 JSON만:
{
  "headline": "...",
  "bullets": ["...","...","...","..."],
  "evidenceIds": ["usdkkrw","us10y","wti","vix"]
}`;

/** 장중 리프레시 — 헤드라인·불릿만. 시나리오/점검 대체 금지 */
export const REFRESH_BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다. 지금은 **장중 리프레시**다.
독자는 일반 개미다. 풀 시나리오·점검은 이미 나와 있고, 건드리지 않는다.

길이 한도(반드시):
- headline: 한글 기준 48자 이내, 한 문장
- bullets: **3~4개**, 각 **80자 이내**, 한 문장
- 군더더기·리포트체 금지

절대 하지 말 것:
- 매수/매도/비중/타이밍 권유
- 종가·당일 방향 단정·예측 ("오늘 오른다/내린다")
- 시나리오 A/B·점검을 새로 쓰거나 대체·암시
- "지금이 기회/위험하니 대응하라"류 행동 촉구
- 등락률 복창으로 끝나는 문장
- 공포·긴급 알림 톤
- 공허한 일반론 ("변동성 유의")

반드시 할 것:
- headline: 장중 **지금** 무슨 온도인지 구체적으로 (사실+짧은 해석)
- bullets:
  1) 장중 핵심 변화 — 무엇이 달라졌는지 (수급·시총·갭·매크로 중 하나)
  2) 왜(근거 하나) — 복창 금지
  3) 직전 시나리오를 볼 때 볼 관측 포인트
  4) 필요할 때만 추가 맥락 한 줄
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
