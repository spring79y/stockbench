"use client";

import { useEffect, useRef, useState } from "react";

const HINT_MS = 5200;

type LegacyWindow = Window & {
  external?: { AddFavorite?: (url: string, title: string) => void };
  sidebar?: { addPanel?: (title: string, url: string, unused: string) => void };
};

function isTouchMobile(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS desktop UA
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isIOSLike(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isAppleDesktop(): boolean {
  if (isTouchMobile()) return false;
  return /Mac|Macintosh/i.test(navigator.userAgent);
}

function tryLegacyBookmark(): boolean {
  const w = window as LegacyWindow;
  const url = window.location.href;
  const title = document.title || "Stock-Bench.com";

  try {
    if (typeof w.external?.AddFavorite === "function") {
      w.external.AddFavorite(url, title);
      return true;
    }
  } catch {
    /* fall through */
  }

  try {
    if (typeof w.sidebar?.addPanel === "function") {
      w.sidebar.addPanel(title, url, "");
      return true;
    }
  } catch {
    /* fall through */
  }

  return false;
}

function guidanceHint(): string {
  if (isTouchMobile()) {
    if (isIOSLike()) {
      return "공유 → 홈 화면/북마크로 추가하세요.";
    }
    if (/Android/i.test(navigator.userAgent)) {
      return "메뉴 → 북마크 또는 홈 화면에 추가하세요.";
    }
    return "브라우저 메뉴에서 북마크 또는 홈 화면에 추가하세요.";
  }

  const shortcut = isAppleDesktop() ? "⌘D" : "Ctrl+D";
  return `${shortcut}로 즐겨찾기에 추가하세요.`;
}

export function BookmarkCta() {
  const [hint, setHint] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function showHint(message: string) {
    setHint(message);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHint(null), HINT_MS);
  }

  function onClick() {
    if (tryLegacyBookmark()) {
      setHint(null);
      return;
    }
    showHint(guidanceHint());
  }

  return (
    <>
      <button
        type="button"
        className="site-footer__nav-link site-footer__bookmark"
        onClick={onClick}
      >
        즐겨찾기
      </button>
      {hint ? (
        <p className="site-footer__bookmark-hint" role="status">
          {hint}
        </p>
      ) : null}
    </>
  );
}
