import type {
  BriefingDraft,
  CollectorSnapshot,
  MarketScope,
} from "@/lib/pipeline/types";

export type CloseIndexRow = {
  id: string;
  name: string;
  changePercent: number;
};

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function directionWord(n: number): "상승" | "하락" | "보합" {
  if (n > 0.05) return "상승";
  if (n < -0.05) return "하락";
  return "보합";
}

/** Primary indexes that must appear in post-close lead for each scope. */
export function requiredPostCloseIds(scope: MarketScope): string[] {
  if (scope === "us") return ["nasdaq", "sp500", "dow"];
  if (scope === "kr") return ["kospi", "kosdaq"];
  return ["kospi", "nasdaq"];
}

/**
 * Prefer Evidence pack indexes; fall back to snapshot quotes.
 * Post-close uses live/session changePercent (마감 등락).
 */
export function resolvePostCloseIndexes(
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): CloseIndexRow[] {
  const pack =
    scope === "us"
      ? snapshot.evidence?.indexes.us ?? []
      : scope === "kr"
        ? snapshot.evidence?.indexes.kr ?? []
        : [
            ...(snapshot.evidence?.indexes.kr ?? []).slice(0, 2),
            ...(snapshot.evidence?.indexes.us ?? []).slice(0, 2),
          ];

  const fromPack = pack
    .filter((q) => Number.isFinite(q.changePercent))
    .map((q) => ({
      id: q.id,
      name: q.name,
      changePercent: q.changePercent as number,
    }));

  if (fromPack.length > 0) {
    const required = new Set(requiredPostCloseIds(scope));
    const preferred = fromPack.filter((q) => required.has(q.id));
    return (preferred.length > 0 ? preferred : fromPack).slice(0, 3);
  }

  return (snapshot.indexes ?? [])
    .filter((q) => {
      if (!Number.isFinite(q.changePercent)) return false;
      if (scope === "us") return q.region === "US";
      if (scope === "kr") return q.region === "KR";
      return true;
    })
    .filter((q) => {
      const required = requiredPostCloseIds(scope);
      return required.length === 0 || required.includes(q.id);
    })
    .slice(0, 3)
    .map((q) => ({
      id: q.id,
      name: q.name,
      changePercent: q.changePercent,
    }));
}

export function formatCloseClause(row: CloseIndexRow): string {
  const dir = directionWord(row.changePercent);
  return `${row.name} 마감 ${dir} ${formatPct(row.changePercent)}`;
}

export function buildPostCloseFirstBullet(rows: CloseIndexRow[]): string | null {
  if (rows.length === 0) return null;
  const clauses = rows.map(formatCloseClause).join(", ");
  return `${clauses} — Evidence 세션 마감 사실.`;
}

export function buildPostCloseHeadline(
  rows: CloseIndexRow[],
  market: string,
): string {
  if (rows.length === 0) {
    return `오늘 ${market} 세션 마감 · Evidence 지수 확인`;
  }
  const lead = rows[0]!;
  const dir = directionWord(lead.changePercent);
  const extra =
    rows.length > 1
      ? ` · ${rows
          .slice(1)
          .map((r) => `${r.name} ${formatPct(r.changePercent)}`)
          .join(", ")}`
      : "";
  return `${lead.name} 마감 ${dir} ${formatPct(lead.changePercent)}${extra}`;
}

/** True when lead text states close direction or signed % for the named index. */
export function textStatesIndexClose(
  text: string,
  row: CloseIndexRow,
): boolean {
  const source = text.replace(/−/g, "-");
  const nameEsc = row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(nameEsc, "i");
  if (!nameRe.test(source)) return false;

  const pct = formatPct(row.changePercent).replace("+", "\\+");
  const pctLoose = `${row.changePercent >= 0 ? "[+]?" : "-"}\\s*${Math.abs(row.changePercent).toFixed(2).replace(".", "\\.")}\\s*%`;
  const hasPct =
    new RegExp(`${nameEsc}[^0-9+%\\-]{0,28}${pct}`, "i").test(source) ||
    new RegExp(`${nameEsc}[^0-9+%\\-]{0,28}${pctLoose}`, "i").test(source);
  const hasDir = new RegExp(
    `${nameEsc}[^가-힣]{0,24}(?:마감\\s*)?(?:상승|하락|보합|급등|급락|올랐|내렸)`,
    "i",
  ).test(source);
  // Also accept "마감 -0.60%" style without explicit 상승/하락 when signed % present
  const hasClosePct = new RegExp(
    `${nameEsc}[^0-9+%\\-]{0,20}마감[^0-9+%\\-]{0,12}${pctLoose}`,
    "i",
  ).test(source);

  return hasPct || hasDir || hasClosePct;
}

/**
 * For kr-post / us-post: headline + first bullet must lead with Evidence close.
 * Returns which required indexes are missing from the lead pair.
 */
export function missingPostCloseLeads(
  briefing: BriefingDraft,
  rows: CloseIndexRow[],
): CloseIndexRow[] {
  if (rows.length === 0) return [];
  const lead = [briefing.headline, briefing.bullets[0] ?? ""].join("\n");
  // Primary index (first) must be stated; secondary is soft if primary present
  const primary = rows[0]!;
  if (textStatesIndexClose(lead, primary)) return [];
  return [primary];
}

export function ensurePostCloseLead(
  briefing: BriefingDraft,
  snapshot: CollectorSnapshot,
  scope: MarketScope,
): BriefingDraft {
  const slot = snapshot.slot;
  if (slot !== "kr-post" && slot !== "us-post") return briefing;

  const rows = resolvePostCloseIndexes(snapshot, scope);
  if (rows.length === 0) return briefing;

  const missing = missingPostCloseLeads(briefing, rows);
  if (missing.length === 0) return briefing;

  const market =
    scope === "us" ? "미국" : scope === "kr" ? "국내" : "한·미";
  const firstBullet = buildPostCloseFirstBullet(rows);
  if (!firstBullet) return briefing;

  const primary = rows[0]!;
  const nextHeadline = textStatesIndexClose(briefing.headline, primary)
    ? briefing.headline
    : buildPostCloseHeadline(rows, market);

  // Drop checklist/boilerplate openers that the close line replaces
  const rest = briefing.bullets.filter(
    (b) =>
      b !== firstBullet &&
      !/지수와\s*(?:시장\s*폭·)?시총\s*상위\s*체감이\s*같은\s*방향이었는지부터\s*정리합니다/.test(
        b,
      ) &&
      !/무엇을\s*흐름을\s*주도했는지\s*봅니다/.test(b) &&
      !/^오늘\s+(?:국내|미국|한·미)\s+세션은\s+지수와/.test(b),
  );

  return {
    ...briefing,
    headline: nextHeadline,
    bullets: [firstBullet, ...rest].slice(0, 5),
  };
}
