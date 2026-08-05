"use client";

import { useEffect, useState } from "react";
import type { StockNewsItem } from "@/lib/market/fetchStockNews";
import styles from "./MegaNews.module.css";

const NEWS_TIMEOUT_MS = 12_000;

export function MarketFlashNews() {
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);
    setLoading(true);
    setError(false);
    fetch("/api/market-news?limit=3", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("news failed");
        return res.json() as Promise<{ items: StockNewsItem[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setNews((data.items ?? []).slice(0, 3));
      })
      .catch(() => {
        if (cancelled) return;
        setNews([]);
        setError(true);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section className="board-block market-flash" aria-labelledby="market-flash-title">
      <div className="block-head">
        <span className="step-no">2</span>
        <div>
          <h2 id="market-flash-title" className="block-head__title">
            증시 속보
          </h2>
          <p className="block-head__sub">시장 영향이 분명한 헤드라인만 · 매매 추천 아님</p>
        </div>
      </div>

      <div className={`flow-sheet ${styles.wrap}`}>
        {loading ? (
          <p className="retail-card__note">뉴스를 불러오는 중…</p>
        ) : error ? (
          <p className="retail-card__note">속보를 불러오지 못했습니다. 잠시 후 새로고침해 보세요.</p>
        ) : news.length === 0 ? (
          <p className="retail-card__note">최근 속보가 없습니다.</p>
        ) : (
          <div className="flow-sheet__table-wrap">
            <table className="flow-sheet__table">
              <thead>
                <tr>
                  <th scope="col">시간</th>
                  <th scope="col">출처</th>
                  <th scope="col" className={styles.thTitle}>
                    헤드라인
                  </th>
                </tr>
              </thead>
              <tbody>
                {news.map((n, i) => (
                  <tr key={n.id} className={i === 0 ? styles.latest : undefined}>
                    <th scope="row">
                      <time dateTime={n.publishedAt || undefined}>{n.publishedLabel}</time>
                    </th>
                    <td className={styles.tdSource}>
                      <span title={n.publisher}>{n.publisher}</span>
                    </td>
                    <td className={styles.tdTitle}>
                      {n.link ? (
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.link}
                        >
                          {n.title}
                        </a>
                      ) : (
                        <span className={styles.link}>{n.title}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
