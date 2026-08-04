"use client";

import { useEffect, useState } from "react";

function formatNow(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function SiteHeader() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href="/" className="brand" aria-label="StockBench 홈">
          <span className="brand__mark" aria-hidden />
          <span className="brand__lockup">
            <span className="brand__text">StockBench</span>
            <span className="brand__tag">데이터로 검증하는 주식 연구소</span>
          </span>
        </a>
        <p className="site-header__clock" aria-live="off" suppressHydrationWarning>
          <span className="site-header__clock-label">현재</span>
          {now ? (
            <time dateTime={now.toISOString()}>{formatNow(now)}</time>
          ) : (
            <time>--.-- --:--:--</time>
          )}
          <span className="site-header__clock-tz">KST</span>
        </p>
      </div>
    </header>
  );
}
