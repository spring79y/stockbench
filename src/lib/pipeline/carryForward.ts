import type { EvidencePack } from "@/lib/pipeline/evidencePack";
import type {
  EditorialView,
  MarketScope,
  PublishedBundle,
} from "@/lib/pipeline/types";
import type { CheckItem, MarketEvent, Scenario } from "@/lib/types";

/** 직전 같은 시장 탭에서 넘길 구조화 연속성 (본문 통째 덤프 금지) */
export type CarryForwardKind = "scenario" | "check" | "upcoming";

export type CarryForwardStatus =
  | "resolved"
  | "due"
  | "refresh"
  | "upcoming"
  | "dropped";

export type CarryForwardItem = {
  id: string;
  kind: CarryForwardKind;
  /** 직전 한 줄 (복창 금지 · 재평가용) */
  priorText: string;
  status: CarryForwardStatus;
  /** 현재 Evidence로 해석된 사실 (있으면 mustCover) */
  evidenceFact?: string;
  /** 브리핑에 반드시 반영 (due+Evidence 사실 있음) */
  mustCover: boolean;
  /** 강제 인용 후보 (슬롯당 최대 2~3) */
  forceCite: boolean;
  /** 연속 슬롯 무변화 카운트 — 2 이상이면 드롭 */
  unchangedSlots: number;
  /** carryStreaks 맵 키 */
  streakKey: string;
  note: string;
};

export type CarryForwardSeed = {
  scenarios: Array<Pick<Scenario, "id" | "label" | "title" | "summary">>;
  checkItems: Array<Pick<CheckItem, "id" | "text">>;
};

export type CarryForwardBlock = {
  priorSlot: string | null;
  priorPublishedAt: string | null;
  seed: CarryForwardSeed;
  items: CarryForwardItem[];
  /** 라이브 must-cover가 있어 연속성 축소됨 */
  shrunkForLive: boolean;
  rules: string[];
};

const MAX_CARRY = 5;
const MAX_FORCE_CITE = 3;

const MACRO_HINTS: Array<{ re: RegExp; id: string; label: string }> = [
  { re: /원\s*\/?\s*달러|환율|usd\s*krw|달러원/i, id: "usdkkrw", label: "원/달러" },
  { re: /10년|국채|금리|us10y|treasury/i, id: "us10y", label: "미 10년물" },
  { re: /\bvix\b|변동성\s*지수/i, id: "vix", label: "VIX" },
  { re: /유가|wti|원유|brent/i, id: "wti", label: "WTI" },
];

const INDEX_HINTS: Array<{ re: RegExp; id: string }> = [
  { re: /코스피(?!\s*200)|kospi(?!\s*200)/i, id: "kospi" },
  { re: /코스닥|kosdaq/i, id: "kosdaq" },
  { re: /나스닥|nasdaq/i, id: "nasdaq" },
  { re: /s\s*&\s*p|s&p/i, id: "sp500" },
  { re: /다우|dow/i, id: "dow" },
  { re: /반도체|sox/i, id: "sox" },
];

function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[0-9]+(?:\.[0-9]+)?%?/g, "#")
    .trim()
    .slice(0, 80);
}

function eventInScope(ev: MarketEvent, scope: MarketScope): boolean {
  if (scope === "us") return ev.region === "US" || ev.region === "GLOBAL";
  if (scope === "kr") return ev.region === "KR" || ev.region === "GLOBAL";
  return true;
}

function hoursUntil(dateISO: string, now: number): number {
  return (new Date(dateISO).getTime() - now) / (60 * 60 * 1000);
}

function formatMacroFact(
  pack: EvidencePack,
  id: string,
  label: string,
): string | undefined {
  const m = pack.macros.find((x) => x.id === id);
  if (!m) return undefined;
  return `${label} 현재 ${m.value} (${m.changeLabel}, dir=${m.direction})`;
}

function formatIndexFact(pack: EvidencePack, id: string): string | undefined {
  const row = [...pack.indexes.kr, ...pack.indexes.us].find((q) => q.id === id);
  if (!row) return undefined;
  const prior =
    row.priorSessionChangePercent == null
      ? "전일세션=n/a"
      : `전일세션=${row.priorSessionChangePercent >= 0 ? "+" : ""}${row.priorSessionChangePercent.toFixed(2)}%`;
  const live = `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(2)}%`;
  return `${row.name} ${prior} · 현재=${live} (${row.changeBasis})`;
}

function resolveCheckAgainstEvidence(
  text: string,
  pack: EvidencePack,
  events: MarketEvent[],
  now: number,
): { fact?: string; status: CarryForwardStatus; note: string } {
  for (const hint of MACRO_HINTS) {
    if (!hint.re.test(text)) continue;
    const fact = formatMacroFact(pack, hint.id, hint.label);
    if (fact) {
      return {
        fact,
        status: "resolved",
        note: "직전 점검을 현재 매크로 숫자로 재평가",
      };
    }
  }

  for (const hint of INDEX_HINTS) {
    if (!hint.re.test(text)) continue;
    const fact = formatIndexFact(pack, hint.id);
    if (fact) {
      return {
        fact,
        status: "resolved",
        note: "직전 점검을 현재 지수로 재평가",
      };
    }
  }

  for (const ev of events) {
    if (ev.kind !== "earnings" || !ev.dateISO) continue;
    const name = ev.title.replace(/\s*실적\s*발표$/, "").trim();
    const tokens = [name, ev.symbol, ev.symbol?.replace(/\.(KS|KQ)$/i, "")]
      .filter((t): t is string => Boolean(t && t.length >= 2));
    const hit = tokens.some((t) =>
      /[A-Za-z]/.test(t) ? text.toLowerCase().includes(t.toLowerCase()) : text.includes(t),
    );
    if (!hit) continue;
    const hours = hoursUntil(ev.dateISO, now);
    if (hours < 0 && ev.actual?.beatLabel) {
      return {
        fact: `${name} 실적 결과: ${ev.actual.beatLabel}${ev.oneLiner ? ` — ${ev.oneLiner}` : ""}`,
        status: "resolved",
        note: "실적 결과 Evidence 있음 → Briefing이 요약 (반응은 contextNews 있을 때)",
      };
    }
    if (
      hours < 0 &&
      ev.actual?.epsActual != null &&
      ev.actual?.epsEstimate != null
    ) {
      const hasNews = Array.isArray(ev.contextNews) && ev.contextNews.length > 0;
      return {
        fact: ev.oneLiner || `${name} 실적 발표됨 · EPS 숫자 Evidence`,
        status: "resolved",
        note: hasNews
          ? "숫자+Evidence뉴스 있음 → Briefing이 결과·시장 반응(이중 서술) 요약. beatLabel 없으면 서프라이즈/미스 단정 금지"
          : "숫자만 · 반응 근거 부족이면 「반응 근거 부족」1줄 또는 생략. 극성 단정 금지",
      };
    }
    if (hours < 0 && !ev.actual?.beatLabel) {
      return {
        status: "due",
        note: "실적 시점은 지났으나 Evidence에 결과 미확인 — 대기/생략 (창작 금지)",
      };
    }
    if (hours >= 0 && hours <= 72) {
      return {
        status: "upcoming",
        note: `실적 예정(${ev.dateLabel}) — 점검만, 결과 단정 금지`,
      };
    }
  }

  for (const ev of events) {
    if (ev.kind === "earnings" || !ev.dateISO) continue;
    const key = ev.title.split("(")[0]?.trim() ?? "";
    if (key.length < 2 || !text.includes(key.slice(0, Math.min(6, key.length)))) {
      continue;
    }
    const hours = hoursUntil(ev.dateISO, now);
    if (hours < 0 && hours >= -36) {
      return {
        status: "due",
        note: "매크로 일정 도래 — Evidence 숫자 없으면 결과 창작 금지",
      };
    }
    if (hours >= 0 && hours <= 72) {
      return {
        status: "upcoming",
        note: `일정 예정(${ev.dateLabel})`,
      };
    }
  }

  return {
    status: "refresh",
    note: "현재 Evidence로 재평가해 문장 갱신 (직전 문구 복창 금지)",
  };
}

function resolveUpcomingEvent(
  ev: MarketEvent,
  now: number,
): { fact?: string; status: CarryForwardStatus; note: string } | null {
  if (!ev.dateISO) {
    return { status: "upcoming", note: "일정 유지 · 날짜 불명확" };
  }
  const hours = hoursUntil(ev.dateISO, now);
  if (hours < -72) return null; // too stale
  if (hours < 0) {
    if (ev.kind === "earnings" && ev.actual?.beatLabel) {
      return {
        fact: `${ev.title}: ${ev.actual.beatLabel} — ${ev.oneLiner}`,
        status: "resolved",
        note: "도래한 실적+결과 Evidence 있음 → mustCover",
      };
    }
    if (
      ev.kind === "earnings" &&
      ev.actual?.epsActual != null &&
      ev.actual?.epsEstimate != null
    ) {
      const hasNews = Array.isArray(ev.contextNews) && ev.contextNews.length > 0;
      return {
        fact: ev.oneLiner || `${ev.title}: EPS 숫자 Evidence`,
        status: "resolved",
        note: hasNews
          ? "숫자+뉴스 Evidence → mustCover · Briefing 이중 서술"
          : "숫자 Evidence → mustCover · 반응은 「반응 근거 부족」또는 생략",
      };
    }
    if (ev.kind === "earnings") {
      return {
        status: "due",
        note: "실적 도래 · Evidence 결과 미확인 — 대기/생략",
      };
    }
    return {
      status: "due",
      note: "일정 도래 · Evidence 사실만 반영",
    };
  }
  if (hours <= 72) {
    return {
      status: "upcoming",
      note: `다가오는 일정(${ev.dateLabel})`,
    };
  }
  return null;
}

function priority(item: CarryForwardItem): number {
  if (item.mustCover && item.status === "resolved") return 0;
  if (item.status === "resolved") return 1;
  if (item.status === "due") return 2;
  if (item.status === "refresh") return 3;
  return 4;
}

function hasLiveMustCover(
  pack: EvidencePack,
  events: MarketEvent[],
  scope: MarketScope,
  now: number,
): boolean {
  return events.some((ev) => {
    if (!eventInScope(ev, scope) || ev.kind !== "earnings" || !ev.dateISO) {
      return false;
    }
    const hours = hoursUntil(ev.dateISO, now);
    const hasResult =
      Boolean(ev.actual?.beatLabel) ||
      (ev.actual?.epsActual != null && ev.actual?.epsEstimate != null);
    return hours < 0 && hours >= -24 && hasResult;
  }) || pack.risk.elevated;
}

/**
 * 같은 시장 탭의 직전 발행 1건에서 scenarios/checkItems/upcoming만 추출·해석.
 * 헤드라인·불릿 본문 덤프 없음. 최대 5개 · forceCite ≤3 · 무변화 2슬롯 드롭.
 */
export function buildCarryForward(input: {
  scope: MarketScope;
  priorView: EditorialView | null | undefined;
  priorEvents: MarketEvent[];
  pack: EvidencePack;
  currentEvents: MarketEvent[];
  now?: number;
}): CarryForwardBlock | null {
  const now = input.now ?? Date.now();
  const prior = input.priorView;
  if (!prior?.scenarios?.length && !prior?.checkItems?.length) {
    return null;
  }

  const streaks = prior.carryStreaks ?? {};
  const events = input.currentEvents.length > 0 ? input.currentEvents : input.priorEvents;
  const scopedEvents = events.filter((e) => eventInScope(e, input.scope));
  const liveMust = hasLiveMustCover(input.pack, scopedEvents, input.scope, now);

  const seed: CarryForwardSeed = {
    scenarios: (prior.scenarios ?? []).slice(0, 2).map((s) => ({
      id: s.id,
      label: s.label,
      title: s.title,
      summary: s.summary,
    })),
    checkItems: (prior.checkItems ?? []).slice(0, 5).map((c) => ({
      id: c.id,
      text: c.text,
    })),
  };

  const raw: CarryForwardItem[] = [];

  for (const s of seed.scenarios) {
    const key = fingerprint(`${s.id}:${s.title}`);
    const prevStreak = streaks[key] ?? 0;
    raw.push({
      id: `scenario-${s.id}`,
      kind: "scenario",
      priorText: `${s.label} ${s.title} — ${s.summary}`,
      status: "refresh",
      mustCover: false,
      forceCite: false,
      unchangedSlots: prevStreak,
      streakKey: key,
      note: "직전 A/B 한 줄 · 현재 Evidence로 분기 재작성 (복창 금지)",
    });
  }

  for (const c of seed.checkItems) {
    const key = fingerprint(c.text);
    const resolved = resolveCheckAgainstEvidence(
      c.text,
      input.pack,
      scopedEvents,
      now,
    );
    const prevStreak = streaks[key] ?? 0;
    const unchangedSlots =
      resolved.status === "resolved" ? 0 : prevStreak + (resolved.status === "refresh" ? 1 : 0);
    if (unchangedSlots >= 2) continue;

    const mustCover = Boolean(resolved.fact) && resolved.status === "resolved";
    raw.push({
      id: `check-${c.id}`,
      kind: "check",
      priorText: c.text,
      status: resolved.status,
      evidenceFact: resolved.fact,
      mustCover,
      forceCite: false,
      unchangedSlots,
      streakKey: key,
      note: resolved.note,
    });
  }

  const priorUpcoming = input.priorEvents
    .filter((e) => eventInScope(e, input.scope))
    .slice(0, 8);
  for (const ev of priorUpcoming) {
    const resolved = resolveUpcomingEvent(ev, now);
    if (!resolved) continue;
    // Prefer current-event twin if present (may have actual)
    const current = scopedEvents.find((e) => e.id === ev.id) ?? ev;
    const withCurrent =
      current !== ev ? resolveUpcomingEvent(current, now) ?? resolved : resolved;
    const key = fingerprint(`upcoming:${ev.id}:${ev.title}`);
    const prevStreak = streaks[key] ?? 0;
    const unchangedSlots =
      withCurrent.status === "resolved"
        ? 0
        : prevStreak + (withCurrent.status === "upcoming" ? 1 : 0);
    if (unchangedSlots >= 2) continue;
    if (raw.some((r) => r.priorText.includes(ev.title.slice(0, 8)))) continue;

    const mustCover =
      Boolean(withCurrent.fact) && withCurrent.status === "resolved";
    raw.push({
      id: `upcoming-${ev.id}`,
      kind: "upcoming",
      priorText: `${ev.dateLabel} ${ev.title}`,
      status: withCurrent.status,
      evidenceFact: withCurrent.fact,
      mustCover,
      forceCite: false,
      unchangedSlots,
      streakKey: key,
      note: withCurrent.note,
    });
  }

  raw.sort((a, b) => priority(a) - priority(b));

  let capped = raw.slice(0, MAX_CARRY);
  let shrunkForLive = false;
  if (liveMust) {
    shrunkForLive = true;
    const must = capped.filter((i) => i.mustCover);
    const oneRefresh = capped.find(
      (i) => !i.mustCover && (i.kind === "check" || i.kind === "scenario"),
    );
    capped = [...must.slice(0, 2), ...(oneRefresh ? [oneRefresh] : [])].slice(
      0,
      Math.min(3, MAX_CARRY),
    );
  }

  let forceLeft = MAX_FORCE_CITE;
  for (const item of capped) {
    if (item.mustCover && forceLeft > 0) {
      item.forceCite = true;
      forceLeft -= 1;
    }
  }

  const rules = [
    "우선순위: 현재 세션 라이브 사실 > due 연속성(Evidence 사실 있을 때) > 미도래 캘린더 프리뷰",
    "연속성은 체크리스트일 뿐 분량 할당이 아님. 라이브 must-cover가 있으면 1불릿·시나리오/점검 갱신만",
    "직전 checkItems는 현재 Evidence 숫자로 재평가 — 어제 문장 복창 금지",
    "이벤트/실적이 이미 발생했고 Evidence에 결과+반응이 있으면 반드시 포함. 결과 없으면 대기/미확인 또는 생략(창작 금지)",
    `최대 ${MAX_CARRY}개 · forceCite ≤${MAX_FORCE_CITE} · 무변화 2연속 슬롯 드롭 · 체인 깊이=직전 1건`,
  ];

  return {
    priorSlot: prior.slot ?? null,
    priorPublishedAt: prior.publishedAt ?? null,
    seed,
    items: capped,
    shrunkForLive,
    rules,
  };
}

/** 발행 시 다음 슬롯용 무변화 스트릭 갱신 */
export function nextCarryStreaks(
  prior: EditorialView | undefined,
  next: EditorialView,
  carry: CarryForwardBlock | null,
): Record<string, number> {
  const out: Record<string, number> = { ...(prior?.carryStreaks ?? {}) };

  if (carry) {
    for (const item of carry.items) {
      if (item.kind === "scenario") continue;
      out[item.streakKey] = item.unchangedSlots;
    }
  }

  // Reset streaks for checks that clearly changed wording
  const priorChecks = new Set((prior?.checkItems ?? []).map((c) => fingerprint(c.text)));
  for (const c of next.checkItems ?? []) {
    const key = fingerprint(c.text);
    if (!priorChecks.has(key)) {
      out[key] = 0;
    }
  }

  // Bound map size
  const entries = Object.entries(out).slice(-40);
  return Object.fromEntries(entries);
}

export function buildAllScopeCarryForward(input: {
  published: PublishedBundle | null;
  pack: EvidencePack;
  currentEvents: MarketEvent[];
  now?: number;
}): Partial<Record<MarketScope, CarryForwardBlock>> {
  if (!input.published?.views) return {};
  const scopes: MarketScope[] = ["all", "kr", "us"];
  const out: Partial<Record<MarketScope, CarryForwardBlock>> = {};
  for (const scope of scopes) {
    const block = buildCarryForward({
      scope,
      priorView: input.published.views[scope],
      priorEvents: input.published.events ?? [],
      pack: input.pack,
      currentEvents: input.currentEvents,
      now: input.now,
    });
    if (block) out[scope] = block;
  }
  return out;
}

export function renderCarryForwardForPrompt(
  block: CarryForwardBlock | null | undefined,
): string[] {
  if (!block || block.items.length === 0) {
    return ["## 직전 연속성 (carry-forward)", "직전 같은 시장 탭 연속성 없음"];
  }

  const force = block.items.filter((i) => i.forceCite);
  const lines = [
    "## 직전 연속성 (carry-forward · 본문 덤프 아님)",
    block.priorSlot
      ? `직전 같은 시장 발행: ${block.priorSlot} @ ${block.priorPublishedAt ?? "n/a"}`
      : "직전 슬롯 메타 없음",
    block.shrunkForLive
      ? "축소: 라이브 must-cover 존재 → 연속성은 1불릿·시나리오/점검 갱신 위주"
      : "연속성 정상 캡 적용",
    "",
    "직전 시나리오 A/B (한 줄만 · 복창 말고 현재 Evidence로 재작성):",
    ...block.seed.scenarios.map(
      (s) => `- ${s.label} ${s.title}: ${s.summary}`,
    ),
    "",
    "직전 오늘 볼 것 (숫자·문장 재평가 필수):",
    ...block.seed.checkItems.map((c) => `- ${c.text}`),
    "",
    "dueFollowUps / carryForward (우선순위 정렬 · 최대 5):",
    ...block.items.map((i) => {
      const cite = i.forceCite ? " [forceCite]" : "";
      const fact = i.evidenceFact ? ` | Evidence: ${i.evidenceFact}` : "";
      return `- [${i.status}/${i.kind}]${cite} ${i.priorText}${fact} — ${i.note}`;
    }),
    "",
    "규칙:",
    ...block.rules.map((r) => `- ${r}`),
  ];

  if (force.length > 0) {
    lines.push(
      "",
      "forceCite (생략 시 Guard hard-fail):",
      ...force.map((i) => `- ${i.priorText}${i.evidenceFact ? ` → ${i.evidenceFact}` : ""}`),
    );
  }

  return lines;
}

/** Guard: forceCite 항목이 본문에 반영됐는지 */
export function forceCiteTokens(item: CarryForwardItem): string[] {
  const tokens: string[] = [];
  const fromPrior = item.priorText
    .split(/[\s·/,:：\-—]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^(여부|유지|돌파|상회|하회|발표|실적)$/.test(t));
  tokens.push(...fromPrior.slice(0, 4));

  if (item.evidenceFact) {
    for (const hint of MACRO_HINTS) {
      if (hint.re.test(item.priorText) || hint.re.test(item.evidenceFact)) {
        tokens.push(hint.label, hint.id === "usdkkrw" ? "환율" : hint.label);
      }
    }
    for (const hint of INDEX_HINTS) {
      if (hint.re.test(item.priorText)) {
        const m = item.evidenceFact.match(/^(\S+)/);
        if (m) tokens.push(m[1]);
      }
    }
    if (/서프라이즈|미스/.test(item.evidenceFact)) {
      tokens.push("서프라이즈", "미스", "실적");
    }
  }

  return [...new Set(tokens.filter(Boolean))];
}
