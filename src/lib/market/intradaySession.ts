/**
 * 1일 차트용 정규장 세션 경계.
 * Yahoo 5m 바가 전일을 섞어 와도 당일 정규장만 남기기 위함.
 */

export type IntradayMarket = "KR" | "US";

export function marketFromYahooSymbol(symbol: string): IntradayMarket {
  if (/\.(KS|KQ)$/i.test(symbol) || /^\^KS/i.test(symbol) || /^\^KQ/i.test(symbol)) {
    return "KR";
  }
  return "US";
}

function zonedParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    mins: hour * 60 + Number(get("minute")),
  };
}

/** timeZone의 ymd + mins 시각에 해당하는 UTC Date (1분 단위 탐색) */
function atZonedClock(timeZone: string, ymd: string, mins: number, around: Date): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  const lo = Date.UTC(y, mo - 1, d, 0, 0, 0) - 14 * 3_600_000;
  const hi = Date.UTC(y, mo - 1, d, 0, 0, 0) + 38 * 3_600_000;
  for (let t = lo; t <= hi; t += 60_000) {
    const cand = new Date(t);
    const p = zonedParts(timeZone, cand);
    if (p.ymd === ymd && p.mins === mins) return cand;
  }
  return around;
}

export type IntradaySessionWindow = {
  market: IntradayMarket;
  timeZone: string;
  sessionYmd: string;
  openMins: number;
  closeMins: number;
  /** 정규장 시작 */
  startMs: number;
  /** 정규장 종료(축용 — 장중이어도 종가 시각) */
  endMs: number;
  /** 시세 포함 상한 */
  untilMs: number;
};

/**
 * 차트에 쓸 정규장 창.
 * - 장중·장후: 오늘 정규장
 * - 개장 전·주말: 직전 평일 정규장
 */
export function resolveIntradaySession(
  symbol: string,
  now = new Date(),
): IntradaySessionWindow {
  const market = marketFromYahooSymbol(symbol);
  const timeZone = market === "KR" ? "Asia/Seoul" : "America/New_York";
  const openMins = market === "KR" ? 9 * 60 : 9 * 60 + 30;
  const closeMins = market === "KR" ? 15 * 60 + 30 : 16 * 60;

  const today = zonedParts(timeZone, now);
  let sessionYmd = today.ymd;

  if (today.weekday === "Sat" || today.weekday === "Sun" || today.mins < openMins) {
    for (let back = 1; back <= 5; back += 1) {
      const probe = new Date(now.getTime() - back * 24 * 60 * 60 * 1000);
      const p = zonedParts(timeZone, probe);
      if (p.weekday === "Sat" || p.weekday === "Sun") continue;
      sessionYmd = p.ymd;
      break;
    }
  }

  const start = atZonedClock(timeZone, sessionYmd, openMins, now);
  const end = atZonedClock(timeZone, sessionYmd, closeMins, now);
  const untilMs = Math.min(now.getTime(), end.getTime());

  return {
    market,
    timeZone,
    sessionYmd,
    openMins,
    closeMins,
    startMs: start.getTime(),
    endMs: end.getTime(),
    untilMs,
  };
}

export function isQuoteInIntradaySession(
  quoteDate: Date,
  window: IntradaySessionWindow,
): boolean {
  const p = zonedParts(window.timeZone, quoteDate);
  if (p.ymd !== window.sessionYmd) return false;
  if (p.mins < window.openMins) return false;
  if (p.mins > window.closeMins) return false;
  if (quoteDate.getTime() > window.untilMs + 2 * 60_000) return false;
  return true;
}
