import { HeaderClock } from "@/components/HeaderClock";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href="/" className="brand" aria-label="Stock-Bench.com 홈">
          <span className="brand__mark" aria-hidden />
          <span className="brand__lockup">
            <span className="brand__text">Stock-Bench.com</span>
            <span className="brand__tag">데이터로 검증하는 주식 연구소</span>
          </span>
        </a>
        <HeaderClock />
      </div>
    </header>
  );
}
