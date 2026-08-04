export function SiteFooter({ live = false }: { live?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand-row">
        <span className="brand__mark" aria-hidden />
        <p className="site-footer__brand">StockBench</p>
      </div>
      <p className="site-footer__disclaimer">
        데이터로 검증하는 주식 연구소 · 참고용 브리핑입니다. 투자 권유·매매 추천이 아니며, 판단과
        책임은 이용자 본인에게 있습니다.
        {live
          ? " 시세는 Yahoo 참고(지연 가능)."
          : " 시세 일부는 임시 데이터일 수 있습니다."}
      </p>
    </footer>
  );
}
