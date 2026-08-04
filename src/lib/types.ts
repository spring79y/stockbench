export type MarketRegion = "KR" | "US";

export type ChangeDirection = "up" | "down" | "flat";

export type MarketMood = "risk-on" | "caution" | "mixed" | "risk-off";

export interface IndexQuote {
  id: string;
  name: string;
  shortName: string;
  region: MarketRegion;
  value: number;
  change: number;
  changePercent: number;
  status: string;
}

export interface MacroChip {
  id: string;
  name: string;
  value: string;
  changeLabel: string;
  direction: ChangeDirection;
}

export interface MarketEvent {
  id: string;
  dateLabel: string;
  region: MarketRegion | "GLOBAL";
  title: string;
  level: "high" | "medium" | "low";
  oneLiner: string;
}

export interface DailyBriefing {
  asOfLabel: string;
  mood: MarketMood;
  moodLabel: string;
  temperature: string;
  headline: string;
  bullets: string[];
  evidenceIds: string[];
}

export interface Scenario {
  id: string;
  label: string;
  title: string;
  summary: string;
  implication: string;
}

export interface CheckItem {
  id: string;
  text: string;
  why: string;
}
