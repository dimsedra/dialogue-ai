import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isPbBackend, usePbProfile } from "@/pb-compat";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSync() {
  // B.7.3: read profile from PB when the flag is on, from Convex
  // otherwise. Both hooks run unconditionally (Rules of Hooks); the
  // unused result is discarded at the ternary below. In production
  // with the flag off, the entire PB branch is DCE'd at build time.
  const pbProfile = usePbProfile();
  const convexProfile = useQuery(api.ai.getProfile, {});
  const profile = isPbBackend() ? pbProfile : convexProfile;
  const publicKey = useQuery(api.push.getPublicKey, {});
  const addSubscription = useMutation(api.push.addSubscription);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    if (!profile || !publicKey) {
      return;
    }

    const pushEnabled = profile.preferences?.pushEnabled ?? false;
    const permission = Notification.permission;

    if (pushEnabled && permission === "granted") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          let subscription = await registration.pushManager.getSubscription();

          if (!subscription) {
            const cleanKey = publicKey.replace(/^["']|["']$/g, "").trim();
            const convertedKey = urlBase64ToUint8Array(cleanKey);
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey,
            });
          }

          // Format subscription keys as expected by the backend
          const subJson = subscription.toJSON();
          if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
            await addSubscription({
              endpoint: subJson.endpoint,
              expirationTime: subJson.expirationTime ?? null,
              keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth,
              },
            });
          }
        })
        .catch((err) => {
          console.error("Failed to automatically synchronize push subscription:", err);
        });
    }
  }, [profile, publicKey, addSubscription]);
}
