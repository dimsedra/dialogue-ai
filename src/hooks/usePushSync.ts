import { useEffect } from "react";
import { isPbBackend, usePbProfile } from "@/pb-compat";

export function usePushSync() {
  const pbProfile = usePbProfile();
  const profile = pbProfile;

  useEffect(() => {
    if (isPbBackend()) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    if (!profile) {
      return;
    }
  }, [profile]);
}
