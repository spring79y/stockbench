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

/** Tiny island so the 1s tick does not re-render SiteHeader / the board. */
export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      setNow(new Date());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <p className="site-header__clock" aria-live="off" suppressHydrationWarning>
      <span className="site-header__clock-label">현재</span>
      {now ? (
        <time dateTime={now.toISOString()}>{formatNow(now)}</time>
      ) : (
        <time>--.-- --:--:--</time>
      )}
      <span className="site-header__clock-tz">KST</span>
    </p>
  );
}
