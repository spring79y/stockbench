"use client";

import { useEffect, useState } from "react";
import type { StockNewsItem } from "@/lib/market/fetchStockNews";
import styles from "./MegaNews.module.css";

export function MarketFlashNews() {
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch("/api/market-news?limit=8")
      .then(async (res) => {
        if (!res.ok) throw new Error("news failed");
        return res.json() as Promise<{ items: StockNewsItem[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setNews((data.items ?? []).slice(0, 8));
      })
      .catch(() => {
        if (cancelled) return;
        setNews([]);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="board-block market-flash" aria-labelledby="market-flash-title">
      <div className="block-head">
        <span className="step-no">5</span>
        <div>
          <h2 id="market-flash-title" className="block-head__title">
            증시 속보
          </h2>
          <p className="block-head__sub">전쟁·정치·세금 포함 · 증시 관련 위주 · 매매 추천 아님</p>
        </div>
      </div>

      <div className={`flow-sheet ${styles.wrap}`}>
        {loading ? (
          <p className="retail-card__note">뉴스를 불러오는 중…</p>
        ) : error ? (
          <p className="retail-card__note">속보를 불러오지 못했습니다.</p>
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
