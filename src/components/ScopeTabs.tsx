"use client";

import Link from "next/link";
import type { MarketScope } from "@/lib/market/scope";
import { MARKET_SCOPE_TABS } from "@/lib/market/scope";

function hrefFor(scope: MarketScope): string {
  return scope === "all" ? "/" : `/?view=${scope}`;
}

function phaseDotClass(hint: string): string | null {
  // 정규장만 붉은 점. 주간거래·프리·애프터는 녹색. 휴장/장마감은 회색.
  if (hint === "데이마켓" || hint === "정규장") {
    return "scope-tabs__dot--regular";
  }
  if (
    hint === "프리장" ||
    hint === "애프터마켓" ||
    hint === "애프터장" ||
    hint === "주간거래"
  ) {
    return "scope-tabs__dot--session";
  }
  if (hint === "장마감" || hint === "주말" || hint === "휴장") {
    return "scope-tabs__dot--closed";
  }
  return null;
}

export function ScopeTabs({
  value,
  hints,
}: {
  value: MarketScope;
  hints?: Partial<Record<MarketScope, string>>;
}) {
  return (
    <div className="scope-tabs-wrap">
      <p className="scope-tabs-wrap__label">시장 보기 선택</p>
      <div className="scope-tabs" role="tablist" aria-label="시장 보기">
        {MARKET_SCOPE_TABS.map((tab) => {
          const selected = value === tab.id;
          const hint = hints?.[tab.id] ?? tab.hint;
          const dotClass = tab.id === "all" ? null : phaseDotClass(hint);
          return (
            <Link
              key={tab.id}
              href={hrefFor(tab.id)}
              scroll={false}
              role="tab"
              aria-selected={selected}
              className={`scope-tabs__btn ${selected ? "scope-tabs__btn--on" : ""}`}
              prefetch
            >
              <span className="scope-tabs__name">{tab.label}</span>
              {hint ? (
                <span className="scope-tabs__hint">
                  {dotClass ? (
                    <span className={`scope-tabs__dot ${dotClass}`} aria-hidden />
                  ) : null}
                  {hint}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
