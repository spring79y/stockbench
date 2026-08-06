import type YahooFinance from "yahoo-finance2";
import { INDEX_DEFINITIONS } from "@/lib/market/map";

export type ChangeBasis =
  | "prior-close"
  | "intraday"
  | "premarket"
  | "postmarket"
  | "unknown";

export type PriorSessionChange = {
  symbol: string;
  priorSessionChangePercent: number | null;
  changeBasis: ChangeBasis;
};

function basisFromMarketState(state: string | undefined): ChangeBasis {
  switch (state) {
    case "CLOSED":
      return "prior-close";
    case "REGULAR":
      return "intraday";
    case "PRE":
    case "PREPRE":
      return "premarket";
    case "POST":
    case "POSTPOST":
      return "postmarket";
    default:
      return "unknown";
  }
}

/** 일봉 종가 2개로 직전 완료 세션 등락률 계산 */
export async function fetchPriorSessionChanges(
  yf: InstanceType<typeof YahooFinance>,
  marketStates: Record<string, string | undefined>,
  liveChangePercents: Record<string, number | undefined>,
): Promise<Record<string, PriorSessionChange>> {
  const period2 = new Date();
  period2.setUTCDate(period2.getUTCDate() - 21);

  const entries = await Promise.all(
    INDEX_DEFINITIONS.map(async (def) => {
      const basis = basisFromMarketState(marketStates[def.symbol]);
      const live = liveChangePercents[def.symbol];

      // 정규장 마감 상태면 Yahoo 등락 = 직전 세션 등락으로 신뢰
      if (basis === "prior-close" && live != null && Number.isFinite(live)) {
        return [
          def.symbol,
          {
            symbol: def.symbol,
            priorSessionChangePercent: Number(live.toFixed(2)),
            changeBasis: basis,
          } satisfies PriorSessionChange,
        ] as const;
      }

      try {
        const chart = await yf.chart(def.symbol, {
          period1: period2,
          interval: "1d",
        });
        const quotes = chart.quotes ?? [];
        const closes = quotes
          .map((q) => (q.close != null ? Number(q.close) : NaN))
          .filter((n) => Number.isFinite(n) && n > 0);

        if (closes.length < 2) {
          return [
            def.symbol,
            {
              symbol: def.symbol,
              priorSessionChangePercent:
                basis === "prior-close" && live != null ? Number(live.toFixed(2)) : null,
              changeBasis: basis,
            } satisfies PriorSessionChange,
          ] as const;
        }

        // 장중/프리면 마지막 봉이 '오늘(미완료)'일 수 있어, 직전 완료 세션 = closes[-2] vs closes[-3]
        // 마감이면 마지막 봉이 직전 세션 종가 = closes[-1] vs closes[-2]
        const useIncompleteLast = basis === "intraday" || basis === "premarket";
        const newerIdx = useIncompleteLast ? closes.length - 2 : closes.length - 1;
        const olderIdx = newerIdx - 1;
        if (olderIdx < 0 || newerIdx < 1) {
          return [
            def.symbol,
            {
              symbol: def.symbol,
              priorSessionChangePercent: null,
              changeBasis: basis,
            } satisfies PriorSessionChange,
          ] as const;
        }

        const newer = closes[newerIdx];
        const older = closes[olderIdx];
        const pct = ((newer - older) / older) * 100;
        return [
          def.symbol,
          {
            symbol: def.symbol,
            priorSessionChangePercent: Number(pct.toFixed(2)),
            changeBasis: basis,
          } satisfies PriorSessionChange,
        ] as const;
      } catch {
        return [
          def.symbol,
          {
            symbol: def.symbol,
            priorSessionChangePercent:
              basis === "prior-close" && live != null ? Number(live.toFixed(2)) : null,
            changeBasis: basis,
          } satisfies PriorSessionChange,
        ] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
