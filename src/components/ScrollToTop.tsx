"use client";

import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 320;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`scroll-top${visible ? " scroll-top--visible" : ""}`}
      aria-label="맨 위로"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg
        className="scroll-top__icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M12 5.5 5.8 11.7l1.4 1.4L11 9.3V19h2V9.3l3.8 3.8 1.4-1.4z"
        />
      </svg>
    </button>
  );
}
