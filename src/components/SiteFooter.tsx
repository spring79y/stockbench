import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "소개" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보" },
  { href: "/disclaimer", label: "면책" },
] as const;

export function SiteFooter({ live = false }: { live?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <Link href="/" className="site-footer__brand-row" aria-label="Stock-Bench.com 홈">
          <span className="brand__mark" aria-hidden />
          <span className="site-footer__brand">Stock-Bench.com</span>
        </Link>

        <nav className="site-footer__nav" aria-label="법적 안내">
          {FOOTER_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="site-footer__nav-link">
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="site-footer__meta-row">
        <p className="site-footer__meta">
          문의{" "}
          <a href="mailto:spring79y@gmail.com" className="site-footer__mail">
            spring79y@gmail.com
          </a>
        </p>
        <p className="site-footer__meta">© HEECHEOL.KIM</p>
      </div>

      <details className="site-footer__details">
        <summary className="site-footer__summary">면책</summary>
        <p className="site-footer__disclaimer">
          Stock-Bench.com(증시 브리핑)은 한·미 시장을 알기 쉽게 간추린 참고용 브리핑입니다.
          투자 권유·매매 추천·수익 보장이 아니며, 판단과 손실에 대한 책임은 이용자 본인에게
          있습니다. 시세·지표는 Yahoo Finance 등 공개 자료를 참고하며 지연·오류가 있을 수
          있고, 실시간 호가·주문 판단용이 아닙니다.
          {live ? " 현재 시세는 Yahoo 참고(지연 가능)입니다." : " 시세 일부는 임시 데이터일 수 있습니다."}{" "}
          자세한 내용은{" "}
          <a href="/disclaimer" className="site-footer__inline-link">
            면책 전문
          </a>
          을 확인해 주세요.
        </p>
      </details>
    </footer>
  );
}
