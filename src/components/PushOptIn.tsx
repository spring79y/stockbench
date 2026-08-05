"use client";

import { useEffect, useState } from "react";
import type { MarketScope } from "@/lib/market/scope";
import type { PipelineSlot } from "@/lib/pipeline/types";
import {
  PUSH_SLOTS_BY_MARKET,
  PUSH_SLOT_SHORT_LABEL,
  defaultSlotsForMarket,
  type PushMarket,
} from "@/lib/push/types";
import styles from "./PushOptIn.module.css";

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

function slotsStorageKey(market: PushMarket): string {
  return `sb-push-slots:${market}`;
}

function loadLocalSlots(market: PushMarket): PipelineSlot[] {
  try {
    const raw = localStorage.getItem(slotsStorageKey(market));
    if (!raw) return defaultSlotsForMarket(market);
    const parsed = JSON.parse(raw) as string[];
    const allowed = new Set(PUSH_SLOTS_BY_MARKET[market]);
    const slots = parsed.filter((s): s is PipelineSlot => allowed.has(s as PipelineSlot));
    return slots.length > 0 ? slots : defaultSlotsForMarket(market);
  } catch {
    return defaultSlotsForMarket(market);
  }
}

function saveLocalSlots(market: PushMarket, slots: PipelineSlot[]) {
  try {
    localStorage.setItem(slotsStorageKey(market), JSON.stringify(slots));
  } catch {
    // ignore
  }
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
  const [slots, setSlots] = useState<PipelineSlot[]>([]);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;
    setSlots(loadLocalSlots(market));

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
        if (!sub) {
          setSubscribed(false);
          return;
        }
        let flag: string | null = null;
        try {
          flag = localStorage.getItem(`sb-push:${market}`);
        } catch {
          flag = null;
        }
        if (flag === "0") {
          setSubscribed(false);
          return;
        }
        setSubscribed(true);
        if (flag == null) {
          try {
            localStorage.setItem(`sb-push:${market}`, "1");
          } catch {
            // ignore
          }
        }
      } catch {
        // 구독 시도는 버튼에서
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [market]);

  if (!market || !enabled) return null;

  const label = market === "kr" ? "한국" : "미국";
  const slotOptions = PUSH_SLOTS_BY_MARKET[market];

  const postSubscription = async (nextSlots: PipelineSlot[]) => {
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
        slots: nextSlots,
      }),
    });
    if (!res.ok) throw new Error("subscribe failed");
  };

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

      const nextSlots = slots.length > 0 ? slots : defaultSlotsForMarket(market);
      await postSubscription(nextSlots);
      saveLocalSlots(market, nextSlots);
      setSlots(nextSlots);
      try {
        localStorage.setItem(`sb-push:${market}`, "1");
      } catch {
        // ignore
      }
      setSubscribed(true);
      setMessage(`${label} 선택한 슬롯 발행 시 알림 (밤 12시–오전 7시 미발송)`);
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
      }
      try {
        localStorage.setItem(`sb-push:${market}`, "0");
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

  const toggleSlot = async (slot: PipelineSlot) => {
    const next = slots.includes(slot)
      ? slots.filter((s) => s !== slot)
      : [...slots, slot];
    if (next.length === 0) {
      setMessage("슬롯을 하나 이상 남겨 두세요. 모두 끄려면 「알림 끄기」를 누르세요.");
      return;
    }
    setSlots(next);
    saveLocalSlots(market, next);
    if (!subscribed) return;

    setBusy(true);
    setMessage(null);
    try {
      await postSubscription(next);
      setMessage("알림 슬롯을 저장했습니다.");
    } catch {
      setMessage("슬롯 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.copy}>
        {label} 브리핑 슬롯 알림 (시세·속보 아님 · 밤 12시–오전 7시 미발송)
      </p>
      <div className={styles.slotRow} role="group" aria-label={`${label} 알림 슬롯`}>
        {slotOptions.map((slot) => {
          const on = slots.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              className={`${styles.slotChip} ${on ? styles.slotChipOn : ""}`}
              disabled={busy}
              aria-pressed={on}
              onClick={() => void toggleSlot(slot)}
            >
              {PUSH_SLOT_SHORT_LABEL[slot] ?? slot}
            </button>
          );
        })}
      </div>
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
