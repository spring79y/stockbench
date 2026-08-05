"use client";

import { useMemo } from "react";
import type { Ks200NightChartPoint } from "@/lib/market/fetchKs200NightFutures";
import { changeToneClass, directionFromChange, formatIndexValue } from "@/lib/format";
import styles from "./Ks200NightChart.module.css";

const WIDTH = 320;
const HEIGHT = 120;
const PAD_Y = 10;

function buildPath(points: Ks200NightChartPoint[]) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usableH = HEIGHT - PAD_Y * 2;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const spanT = t1 - t0 || 1;

  const coords = points.map((p) => {
    const x = ((p.t - t0) / spanT) * WIDTH;
    const y = PAD_Y + (1 - (p.v - min) / span) * usableH;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${HEIGHT} L${coords[0].x.toFixed(1)},${HEIGHT} Z`;
  return { line, area, min, max };
}

function formatAxisTime(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export function Ks200NightChart({
  points,
  changePercent,
}: {
  points: Ks200NightChartPoint[];
  changePercent: number;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    return buildPath(points);
  }, [points]);

  if (!path) {
    return <p className={styles.empty}>차트 데이터가 쌓이면 표시됩니다.</p>;
  }

  const tone = changeToneClass(directionFromChange(changePercent));
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className={styles.wrap} aria-hidden>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
      >
        <path className={styles.area} d={path.area} />
        <path className={`${styles.line} ${tone}`} d={path.line} />
      </svg>
      <div className={styles.meta}>
        <span>
          {formatAxisTime(first.t)} · {formatIndexValue(path.min)}
        </span>
        <span>
          {formatAxisTime(last.t)} · {formatIndexValue(path.max)}
        </span>
      </div>
    </div>
  );
}
