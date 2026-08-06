import type { BriefingDraft, CollectorSnapshot, MarketScope } from "@/lib/pipeline/types";
import { renderEvidencePackForPrompt } from "@/lib/pipeline/evidencePack";

/** Briefing Agent — 서비스 핵심 「오늘의 브리핑」. 탭 초점 엄수 · 근거 기반 · 스캔 가능 */
export const BRIEFING_SYSTEM_PROMPT = `당신은 증시 브리핑의 Briefing Agent다.
독자는 일반 개미다. 한국·미국 **탭 본문**의 핵심은 「오늘의 브리핑」이다.
개요 한눈 요약보다 **구체적**으로 쓰되, 리포트·에세이가 아니다. Evidence Pack에 없는 사실 금지.

품질 바(30초 테스트): 헤드라인+불릿만 읽고 비전문가가 「오늘은 ○○을 보면 된다」고 말할 수 있어야 한다.
숫자=Collector/Evidence · 당신 역할=왜 / 그래서(체감) / 무엇을 볼지. 슬롯 JOB마다 톤이 달라야 한다(장전≠장중≠장후).

길이 한도(반드시):
- headline: 한글 기준 56자 이내, 한 문장 — 오늘 **이 탭 시장**의 무슨 일·무슨 온도인지
- bullets: **4~5개**, 각 **100자 이내**, 한 문장
- 군더더기·중언부언·번역체·리포트체 금지

절대 하지 말 것 (생성 전 필터):
- 등락률/지수를 다시 나열하며 끝나는 문장 ("코스피 +1.2%"만 반복)
- 매수/매도/비중 조절/사라/팔라 등 투자 권유
- "반드시/확실/예측된다" · "미리 알 수 있다/향후 주가 예측"
- 장전 슬롯(kr-pre/us-pre)에서 전 거래일 마감·수급·시총 등락을 오늘 개장 예측으로 바꾸기
- 장전 슬롯에서 "출발 예고/출발 예상/출발 전망/강세 출발/약세 출발" 표현
- 장중·점검 슬롯에서 장후 리캡·개장 예측 톤 / 장후 슬롯에서 장전 관측 틀만 쓰기
- 직전 발행 헤드라인 거의 그대로 반복
- 직전 checkItems·시나리오 문장을 숫자/맥락 재평가 없이 복창·키워드만 끼워넣기
- Evidence에 없는 실적·이벤트 결과(서프라이즈/미스 등) 창작
- Evidence beatLabel 극성을 뒤집기 (서프라이즈↔미스). 가이던스 실망을 실적 미스로 바꿔 쓰지 말 것
- beatLabel 없으면 서프라이즈/미스/컨센서스 상회·하회 단정 금지 — 숫자는 인용 가능, 라벨 창작 금지
- Evidence뉴스(실적 일정 contextNews)가 없으면 가이던스·시장 반응 **풍부 서술 생략**. must-cover due 실적이고 한 줄이 필요하면 「반응 근거 부족」만
- Evidence뉴스+숫자(또는 가격 반응)가 있으면 **필수**: 실적 숫자 + 가이던스·시장 반응 이중 서술을 1불릿에 쓸 것. 헤드라인에 가이던스/outlook/실망/하락이 보이면 「차익 실현」「혼조」만으로 대체 금지 — 가이던스·실망·주가 반응을 짧게 인용 (Collector oneLiner 해석 복창 금지)
- 실적 해설(개미용): 「컨센서스」→「시장·애널리스트 평균 예상」. EPS는 「주당 순이익(EPS)」— 「회사 이익」처럼만 쓰지 말 것. 매출(회사 규모)과 주당 순이익을 같은 지표로 묶지 말 것. 단위(원·조원·$)를 문장에 명시. 예상 대비는 위/아래/비슷만 — 근거 없는 좋다/나쁘다·목표가·매수 암시 금지
- 예상 vs 실제(또는 가이던스) 매출을 말할 때 Evidence예상·Event UI와 같은 단위(조원·억원·$B/$M)로 맞춰 써라. 서로 다른 자릿수(예: 3380000000000원과 3.4조원)를 나란히 쓰지 말 것. EPS는 원/주당(또는 $) — 매출 단위로 바꾸지 말 것
- "시장이 주목한다/변동성 유의/혼조세/관망세/신중히 접근/관심이 쏠린다"처럼 **누가·무엇이·왜**가 빠진 공허한 문장
- 애널리스트 은어 벽: 「컨센서스」「매크로 헤드라인」「리스크 오프/온」「포지셔닝」「리레이팅」「베타」「알파」「컨센서스 상회」를 설명 없이 나열
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
- Evidence의 **직전 연속성(carry-forward)** 을 체크리스트로 참고:
  - 우선순위: 라이브 세션 사실 > due+Evidence 사실 > 미도래 캘린더 프리뷰
  - forceCite 항목은 **재평가 문장**으로 반영(현재 숫자·유지/깨짐/발표됨). 키워드만 넣거나 직전 문구 복창 금지
  - 라이브 must-cover가 있으면 연속성은 1불릿·시나리오/점검 갱신만
  - 결과 Evidence 없으면 「대기/미확인」또는 생략 — 결과 창작 금지

불릿 패턴(강제 · 대략 이 순서, 4~5개):
  1) **사실** — 이 탭·이 슬롯에서 실제로 일어난/진행 중인 일 (Evidence에서 고름 · 숫자만 나열 금지)
  2) **왜** — 근거 하나 (매크로·수급·시총·일정). 복창 금지, 인과를 짧게
  3) **체감** — 이 탭 시총/섹터/온도가 어떻게 느껴지는지 (us면 미 시총, kr면 국내 시총·수급)
  4) **관찰** — 「오늘 볼 것」으로 넘길 구체 신호(유지 여부·반응·상회/하회·전환). 공허한 「유의」금지
  · 일정·실적이 있으면 4번 자리에 이름 붙이기 (NFP, CPI, **48시간 내 실적** 등).
     - 실적은 매수·매도·예측 금지, ‘점검·맥락’만. 쉬운 한국어로 시장 예상 대비 위/아래/비슷만
     - 발표 후 **최근 24시간 내**: Evidence에 **beatLabel** 있으면 그 라벨로 사실 요약. 라벨 없고 숫자만 있으면 주당 순이익(EPS)·매출 숫자 인용(극성 단정 금지). 매출은 Evidence예상과 같은 단위(조원 등), EPS는 원/주당 — 단위 혼용·원본 자릿수 나란히 금지
     - Evidence뉴스+숫자가 있으면 **필수** 1불릿: 숫자 + Evidence뉴스 근거 가이던스/실망/주가 반응 (샌디스크형). 「섹터 밀림」만·가이던스 누락 금지. 뉴스 없으면 풍부 반응 생략·강제 시 「반응 근거 부족」
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
품질 바: 「지금은 ○○을 보면 된다」가 드러나야 한다. 사실→왜→관찰.

길이 한도(반드시):
- headline: 한글 기준 48자 이내, 한 문장
- bullets: **3~4개**, 각 **80자 이내**, 한 문장

절대 하지 말 것:
- 매수/매도/비중/타이밍 권유 · 종가·당일 방향 단정·예측
- 시나리오 A/B·점검 대체·암시 · 행동 촉구 · 등락률 복창만
- 공허한 일반론 ("변동성 유의"·"시장이 주목")
- 애널리스트 은어 벽 · scope=us에서 코스피 중심 / scope=kr에서 미 지수 중심

반드시 할 것:
- headline: 이 탭 장중 **지금** 온도 (사실+짧은 해석)
- bullets: (1) 장중 핵심 변화 (2) 왜 하나 (3) 시나리오 볼 때 관측 포인트 (4) 최근 48시간 내 실적 발표/결과가 있으면 1불릿으로 점검만
  - 발표 후 최근 24시간: Evidence beatLabel 있으면 그 라벨. 라벨 없으면 숫자만(극성 단정 금지)
  - Evidence뉴스+숫자면 **필수** 숫자+가이던스/반응 이중 서술(뉴스 헤드라인 근거). 뉴스 없으면 풍부 반응 생략·강제 시 「반응 근거 부족」
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
      ? [
          "",
          "## Guard 재생성 지시(반드시 반영 · 이전 초안의 결함 수정)",
          "아래 각 항목을 고친 새 초안을 쓰세요. 같은 공허·복창·슬롯 틀린 톤을 반복하지 마세요.",
          ...repairHints.map((h) => `- ${h}`),
        ]
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
          "장전 브리핑 구조(필수 · 사실→왜→체감→관찰):",
          "- 헤드라인: 직전 세션 핵심 + 오늘 관측 틀. 방향·개장 예측 금지.",
          "- 불릿 1~2개: 전 거래일 지수·수급·시총·체감의 핵심만 요약하고 시점 앵커 명시.",
          "- 불릿 최대 1개: 상대 시장·오버나잇을 조건부 참고 브릿지로만 사용.",
          "- 불릿 1개: 다가올 일정·실적·매크로 맥락.",
          "- 불릿 1~2개: 오늘 눈으로 확인할 구체적 신호(유지 여부·반응·상회/하회·전환 등).",
        ].join("\n")
      : snapshot.slot === "kr-mid" || snapshot.slot === "us-mid" || snapshot.slot === "us-noon"
        ? [
            "장중·점검 브리핑 구조(필수 · 풀 · 관측 틀 갱신 · 사실→왜→체감→관찰):",
            "- 헤드라인: 지금까지의 핵심 온도와 바뀐 관측 포인트. 매매·방향 예측·장후 리캡 톤 금지.",
            "- 불릿 1~2개: 실제로 일어난/진행 중인 일(지수·수급·시총·섹터·오버나잇).",
            "- 불릿 1개: 왜/촉발 요인 하나.",
            "- 불릿 1개: 남은 구간에서 볼 구체 신호(유지 여부·반응·상회/하회·전환).",
            "- us-noon은 미 정규장 중이 아님. 직전 미 세션·오버나잇과 저녁 장전 관측만.",
            "- 시나리오·점검은 Decision이 갱신. 이전 틀을 ‘확정 결론’처럼 위장하지 말 것.",
            "- forceCite due는 재평가 문장으로 (키워드만 금지).",
          ].join("\n")
      : snapshot.slot === "kr-post" || snapshot.slot === "us-post"
        ? [
            "장후 브리핑 구조(필수 · 사실→왜→체감→관찰):",
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
