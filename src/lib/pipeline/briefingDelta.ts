import type { EditorialView, PipelineMode } from "@/lib/pipeline/types";

/** 직전 발행 대비 짧은 변화 요약 (Publisher 규칙 · LLM 아님) */
export function buildChangeLines(
  prev: EditorialView | undefined,
  next: EditorialView,
  mode: PipelineMode,
): string[] {
  if (!prev?.briefing) {
    return ["첫 발행 · 비교할 직전 브리핑 없음"];
  }

  const lines: string[] = [];

  if (prev.briefing.headline.trim() !== next.briefing.headline.trim()) {
    const h = next.briefing.headline.trim();
    lines.push(`헤드라인 변경 · ${h.length > 36 ? `${h.slice(0, 36)}…` : h}`);
  }

  const prevBullets = prev.briefing.bullets.map((b) => b.trim()).join("\n");
  const nextBullets = next.briefing.bullets.map((b) => b.trim()).join("\n");
  if (prevBullets !== nextBullets) {
    lines.push(mode === "refresh" ? "장중 헤드라인·불릿 갱신" : "브리핑 불릿 갱신");
  }

  if (mode === "full") {
    const prevScenarios = (prev.scenarios ?? []).map((s) => `${s.id}:${s.title}`).join("|");
    const nextScenarios = (next.scenarios ?? []).map((s) => `${s.id}:${s.title}`).join("|");
    if (prevScenarios !== nextScenarios) {
      lines.push("시나리오 A/B 갱신");
    }

    const prevChecks = (prev.checkItems ?? []).map((c) => c.text.trim()).join("|");
    const nextChecks = (next.checkItems ?? []).map((c) => c.text.trim()).join("|");
    if (prevChecks !== nextChecks) {
      lines.push("오늘 볼 것 갱신");
    }
  }

  if (lines.length === 0) {
    return ["직전 발행 대비 큰 변화 없음"];
  }

  return lines.slice(0, 3);
}
