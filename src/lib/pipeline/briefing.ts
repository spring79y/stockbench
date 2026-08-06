import type { BriefingDraft, CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Briefing Agent — 서비스 핵심 「오늘의 브리핑」. 탭 초점 엄수 · 근거 기반 · 스캔 가능 */
export const BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다.
독자는 일반 개미다. 한국·미국 **탭 본문**의 핵심은 「오늘의 브리핑」이다.
개요 한눈 요약보다 **구체적**으로 쓰되, 리포트·에세이가 아니다. Evidence Pack에 없는 사실 금지.

길이 한도(반드시):
- headline: 한글 기준 56자 이내, 한 문장 — 오늘 **이 탭 시장**의 무슨 일·무슨 온도인지
- bullets: **4~5개**, 각 **100자 이내**, 한 문장
- 군더더기·중언부언·번역체·리포트체 금지

절대 하지 말 것:
- 등락률/지수를 다시 나열하며 끝나는 문장 ("코스피 +1.2%"만 반복)
- 매수/매도/비중 조절/사라/팔라 등 투자 권유
- "반드시/확실/예측된다" · "미리 알 수 있다/향후 주가 예측"
- 장전 슬롯(kr-pre/us-pre)에서 전 거래일 마감·수급·시총 등락을 오늘 개장 예측으로 바꾸기
- 장전 슬롯에서 "출발 예고/출발 예상/출발 전망/강세 출발/약세 출발" 표현
- 직전 발행 헤드라인 거의 그대로 반복
- "시장이 주목한다/변동성 유의/혼조세"처럼 **누가·무엇이·왜**가 빠진 공허한 문장
- scope=us인데 코스피/코스닥/국내 수급/KS200을 헤드라인이나 불릿 과반으로 쓰기
- scope=kr인데 나스닥/S&P/다우를 헤드라인이나 불릿 과반으로 쓰기

반드시 할 것 (scope별):
- scope=us:
  - 헤드라인 + 불릿 최소 3개 = 미 지수·금리·VIX·미 시총·US/GLOBAL 일정만
  - 코스피/코스닥/국내 수급/KS200: **헤드라인 금지**. 본문은 **최대 1불릿** 브릿지(예: 국내 마감이 미장에 주는 맥락)만
- scope=kr:
  - 헤드라인 + 불릿 최소 3개 = 국내 지수·수급·시총·KS200·환율
  - 나스닥/S&P/다우: **헤드라인 금지**. 본문 **최대 1불릿** 브릿지만
- scope=all: 한·미 균형. 한쪽만 장황 금지.

불릿 구성(가능하면 4~5개):
  1) **핵심 사실** — 이 탭에서 실제로 일어난/진행 중인 일 (Evidence Pack에서 고름)
  2) **왜** — 근거 하나 (매크로·수급·시총·일정). 복창 금지, 인과를 짧게
  3) **체감** — 이 탭 시총/섹터/온도 (us면 미 시총, kr면 국내 시총·수급)
  4) **일정·세션** — 있으면 이름 붙이기 (NFP, CPI, 옵션만기, **48시간 내 실적 발표** 등).
     - 실적은 매수·매도·예측 금지, ‘점검·맥락’만
     - 발표 후 **최근 24시간 내 실적 결과(서프라이즈/미스)**가 Evidence에 있으면, 숫자 복창 없이 **예상 대비 결과를 사실 요약**으로 1불릿만
  5) **관찰 힌트** — 「오늘 볼 것」으로 넘길 관측 포인트
- Evidence Pack elevated일 때만 유가/VIX/환율을 짧게
- elevated 아니면 정치·전쟁 억지 금지
- evidenceIds: 실제로 쓴 매크로 id만. 불릿/헤드라인에 그 지표 이름이 드러나게

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

절대 하지 말 것:
- 매수/매도/비중/타이밍 권유 · 종가·당일 방향 단정·예측
- 시나리오 A/B·점검 대체·암시 · 행동 촉구 · 등락률 복창만
- 공허한 일반론 ("변동성 유의")
- scope=us에서 코스피 중심 / scope=kr에서 미 지수 중심

반드시 할 것:
- headline: 이 탭 장중 **지금** 온도 (사실+짧은 해석)
- bullets: (1) 장중 핵심 변화 (2) 왜 하나 (3) 시나리오 볼 때 관측 포인트 (4) 최근 48시간 내 실적 발표/결과가 있으면 1불릿으로 점검만
  - 발표 후 최근 24시간 실적 결과가 Evidence에 있으면, 숫자 복창 없이 예상 대비 결과(서프라이즈/미스)만 사실 요약
- scope=us: 미장만. 국내는 최대 1불릿 브릿지.
- scope=kr: 국내만. 미국은 최대 1불릿 브릿지.
- evidenceIds: 실제로 쓴 매크로 id만

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

  const scopeHard =
    scope === "us"
      ? "하드 규칙: 미국 탭 — 코스피를 주인공으로 쓰지 말 것. 미 지수·금리·VIX·미 시총 중심."
      : scope === "kr"
        ? "하드 규칙: 한국 탭 — 미 지수를 주인공으로 쓰지 말 것. 국내 지수·수급·시총 중심."
        : "하드 규칙: 통합 — 한·미 균형.";

  const temporalHard =
    snapshot.slot === "kr-pre" || snapshot.slot === "us-pre"
      ? [
          "시점 하드 규칙(위반 시 발행 차단):",
          "- Evidence의 **전일세션마감** 숫자만 '전일/전 거래일/직전 마감' 요약에 사용.",
          "- 장중(당일)/프리/애프터 등락을 전일 마감으로 쓰지 말 것 (시점 둔갑 금지).",
          "- 전 거래일 숫자를 오늘 개장 방향·수급 예측으로 연결하지 말 것.",
          "- '출발 예고/출발 예상/출발 전망/개장 예상/강세 출발/약세 출발' 금지.",
          "- 야간선물·오버나잇은 출처를 밝힌 조건부 참고 맥락만 허용하며 예측·전망으로 쓰지 말 것.",
        ].join("\n")
      : "";
  const slotStructure =
    snapshot.slot === "kr-pre" || snapshot.slot === "us-pre"
      ? [
          "장전 브리핑 구조(필수):",
          "- 헤드라인: 직전 세션 핵심 + 오늘 관측 틀. 방향·개장 예측 금지.",
          "- 불릿 1~2개: 전 거래일 지수·수급·시총·체감의 핵심만 요약하고 시점 앵커 명시.",
          "- 불릿 최대 1개: 상대 시장·오버나잇을 조건부 참고 브릿지로만 사용.",
          "- 불릿 1개: 다가올 일정·실적·매크로 맥락.",
          "- 불릿 1~2개: 오늘 눈으로 확인할 구체적 신호(유지 여부·반응·상회/하회·전환 등).",
        ].join("\n")
      : snapshot.slot === "kr-post" || snapshot.slot === "us-post"
        ? [
            "장후 브리핑 구조(필수):",
            "- 헤드라인: 오늘 해당 시장의 세션 결과·온도 + 가장 중요한 촉발 요인 1개.",
            "- 불릿 1개: 지수와 시장 폭·체감의 관계.",
            "- 불릿 1개: 수급(한국) 또는 메가캡·시총(미국).",
            "- 불릿 1개: 장중 주요 촉발 요인·이벤트·섹터 흐름.",
            "- 불릿 최대 1개: 다음 상대 시장은 방향 예측 없이 연결·점검만.",
            "- 숫자 나열이 아니라 무엇이 장중 흐름을 만들었는지 요약.",
          ].join("\n")
        : "";

  if (snapshot.evidence) {
    return [
      modeLine,
      scopeHard,
      temporalHard,
      slotStructure,
      renderEvidencePackForPrompt(snapshot.evidence, scope),
      ...repair,
    ].join("\n");
  }

  const indexes =
    scope === "us"
      ? snapshot.indexes.filter((q) => q.region === "US")
      : scope === "kr"
        ? snapshot.indexes.filter((q) => q.region === "KR")
        : snapshot.indexes;

  const extra =
    scope === "kr" && snapshot.retailScan
      ? [
          "",
          "바로 볼 지표(KR):",
          `- 코스피200: ${snapshot.retailScan.ks200?.label ?? "n/a"}`,
          `- 시총상위: ${snapshot.retailScan.topCapsSummary ?? "n/a"}`,
          `- 수급: ${snapshot.retailScan.flowSummary ?? "n/a"}`,
        ]
      : scope === "us"
        ? ["", "바로 볼 지표: US 탭에서는 국내 수급·KS200 생략."]
        : snapshot.retailScan
          ? [
              "",
              "바로 볼 지표:",
              `- 시총상위: ${snapshot.retailScan.topCapsSummary ?? "n/a"}`,
              `- 신호: ${snapshot.retailScan.signalSummary ?? "n/a"}`,
            ]
          : [];

  return [
    modeLine,
    scopeHard,
    temporalHard,
    slotStructure,
    `탭 초점(scope): ${scope}`,
    `슬롯: ${snapshot.slot}`,
    `온도: ${snapshot.temperature}`,
    `분위기: ${snapshot.moodLabel}`,
    "",
    "지수:",
    ...indexes.map((q) => `- ${q.id} ${q.name} (${q.changePercent.toFixed(2)}%)`),
    "",
    "매크로:",
    ...snapshot.macros.map(
      (m) => `- ${m.id} ${m.name} ${m.value} ${m.changeLabel} dir=${m.direction}`,
    ),
    ...extra,
    ...repair,
  ].join("\n");
}

export function isBriefingDraft(v: unknown): v is BriefingDraft {
  if (!v || typeof v !== "object") return false;
  const o = v as BriefingDraft;
  return (
    typeof o.headline === "string" &&
    Array.isArray(o.bullets) &&
    o.bullets.every((b) => typeof b === "string") &&
    Array.isArray(o.evidenceIds) &&
    o.evidenceIds.every((id) => typeof id === "string")
  );
}
