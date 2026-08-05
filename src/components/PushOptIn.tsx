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

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
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
        } else {
          try {
            setSubscribed(localStorage.getItem(`sb-push:${market}`) === "1");
          } catch {
            setSubscribed(false);
          }
        }
      } catch {
        if (!cancelled) setEnabled(false);
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
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMessage("알림 권한이 필요합니다.");
        return;
      }

      const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
      const vapid = (await vapidRes.json()) as { publicKey?: string };
      if (!vapid.publicKey) throw new Error("no vapid");

      const reg = await ensureServiceWorker();
      if (!reg) throw new Error("no sw");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
        });
      }

      const json = sub.toJSON();
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
      setMessage("구독에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await ensureServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, market }),
        });
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
        {busy ? "처리 중…" : subscribed ? "알림 끄기" : "이 시장 알림 켜기"}
      </button>
      {message ? <p className={styles.msg}>{message}</p> : null}
    </div>
  );
}
