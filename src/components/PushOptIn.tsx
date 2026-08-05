"use client";

import { useEffect, useState } from "react";
import type { MarketScope } from "@/lib/market/scope";
import styles from "./PushOptIn.module.css";

type PushMarket = "kr" | "us";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function canUseWebPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  // Android를 iPadOS 판별로 오인하지 않음
  if (isAndroid()) return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function unsupportedPushHint(): string {
  if (isAndroid()) {
    return "알림을 켤 수 없습니다. Chrome 사이트 설정에서 이 사이트의 알림을 허용해 주세요.";
  }
  if (isAppleTouchDevice()) {
    return "iPhone·iPad는 Safari 공유 → 홈 화면에 추가한 뒤, 그 아이콘으로 열어 알림을 켤 수 있습니다.";
  }
  return "이 브라우저는 웹 푸시를 지원하지 않습니다. Chrome에서 열어 주세요.";
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canUseWebPush()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export function PushOptIn({ scope }: { scope: MarketScope }) {
  const market: PushMarket | null = scope === "kr" || scope === "us" ? scope : null;
  const [enabled, setEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/push/vapid", { cache: "no-store" });
        const data = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
        if (cancelled) return;
        if (!data.enabled || !data.publicKey) {
          setEnabled(false);
          return;
        }
        setEnabled(true);
      } catch {
        if (!cancelled) setEnabled(false);
        return;
      }

      if (!canUseWebPush()) return;

      try {
        const reg = await ensureServiceWorker();
        const sub = await reg?.pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(sub));
        if (sub) {
          try {
            localStorage.setItem(`sb-push:${market}`, "1");
          } catch {
            // ignore
          }
        }
      } catch {
        // 구독 시도는 버튼에서 다시 진행
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [market]);

  if (!market || !enabled) return null;

  const label = market === "kr" ? "한국" : "미국";

  const subscribe = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!canUseWebPush()) {
        setMessage(unsupportedPushHint());
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMessage(
          isAndroid()
            ? "알림 권한이 필요합니다. Chrome 주소창 왼쪽 자물쇠 → 알림 허용 후 다시 눌러 주세요."
            : "알림 권한이 필요합니다.",
        );
        return;
      }

      const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
      const vapid = (await vapidRes.json()) as { publicKey?: string };
      if (!vapid.publicKey) throw new Error("no vapid");

      const reg = await ensureServiceWorker();
      if (!reg) {
        setMessage(unsupportedPushHint());
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
        });
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("bad subscription");
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          market,
        }),
      });
      if (!res.ok) throw new Error("subscribe failed");

      try {
        localStorage.setItem(`sb-push:${market}`, "1");
      } catch {
        // ignore
      }
      setSubscribed(true);
      setMessage(`${label} 슬롯 발행 시 알림을 보냅니다.`);
    } catch {
      setMessage(
        isAndroid()
          ? "구독에 실패했습니다. Chrome에서 사이트를 새로고침한 뒤 다시 시도해 주세요."
          : isAppleTouchDevice()
            ? unsupportedPushHint()
            : "구독에 실패했습니다. Chrome에서 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!canUseWebPush()) {
        setMessage(unsupportedPushHint());
        return;
      }
      const reg = await ensureServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, market }),
        });
        try {
          await sub.unsubscribe();
        } catch {
          // ignore
        }
      }
      try {
        localStorage.removeItem(`sb-push:${market}`);
      } catch {
        // ignore
      }
      setSubscribed(false);
      setMessage(`${label} 알림을 껐습니다.`);
    } catch {
      setMessage("해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.copy}>
        {label} 장전·장중·장후 브리핑이 나오면 알림 (시세·속보 알림 아님)
      </p>
      <button
        type="button"
        className={styles.btn}
        disabled={busy}
        onClick={() => void (subscribed ? unsubscribe() : subscribe())}
      >
        {busy ? "처리 중…" : subscribed ? "알림 끄기" : "알림 받기"}
      </button>
      {message ? <p className={styles.msg}>{message}</p> : null}
    </div>
  );
}
