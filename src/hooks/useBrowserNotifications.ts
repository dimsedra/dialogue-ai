"use client";

import { useEffect } from "react";

export function useBrowserNotifications() {
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);
}
