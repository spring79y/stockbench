/** First-load shell — hold layout instead of empty 「불러오는 중…」. */
export function BoardSkeleton({
  note = "직전 보드 준비 중",
}: {
  note?: string;
}) {
  return (
    <main className="board board--skeleton" aria-busy="true" aria-label={note}>
      <div className="scope-tabs-wrap">
        <p className="scope-tabs-wrap__label">시장 보기 선택</p>
        <div className="scope-tabs" aria-hidden>
          <span className="scope-tabs__btn scope-tabs__btn--on skeleton-block" />
          <span className="scope-tabs__btn skeleton-block" />
          <span className="scope-tabs__btn skeleton-block" />
        </div>
      </div>
      <section className="board-block skeleton-pulse">
        <div className="skeleton-line skeleton-line--lg" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line--sm" />
      </section>
      <section className="board-block skeleton-pulse">
        <div className="skeleton-line skeleton-line--md" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line--sm" />
      </section>
      <p className="skeleton-note">{note}</p>
    </main>
  );
}
