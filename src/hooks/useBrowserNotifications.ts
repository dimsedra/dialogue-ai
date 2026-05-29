"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { rewriteActionUrl } from "@/components/notifications-bell";

export function useBrowserNotifications() {
  const router = useRouter();
  const unreadNotifications = useQuery(api.notifications.listUnread);
  const prevNotificationsRef = useRef<any[]>([]);
  const isFirstLoadRef = useRef(true);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Monitor unread notifications reactively
  useEffect(() => {
    if (unreadNotifications === undefined) return;

    if (isFirstLoadRef.current) {
      prevNotificationsRef.current = unreadNotifications;
      isFirstLoadRef.current = false;
      return;
    }

    // Filter to find new notifications that weren't in the previous unread list
    const newNotifications = unreadNotifications.filter(
      (n) => !prevNotificationsRef.current.some((prev) => prev._id === n._id)
    );

    if (newNotifications.length > 0) {
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        newNotifications.forEach((n) => {
          // Avoid triggering alerts for stale notifications (more than 1 minute old)
          if (Date.now() - n.createdAt < 60000) {
            // Only fire system notification if the document/tab is hidden
            if (document.hidden) {
              const notification = new Notification(n.title, {
                body: n.message,
                icon: "/favicon.ico",
              });

              notification.onclick = () => {
                window.focus();
                const targetUrl = rewriteActionUrl(n.actionUrl);
                if (targetUrl) {
                  router.push(targetUrl);
                }
              };
            }
          }
        });
      }
    }

    prevNotificationsRef.current = unreadNotifications;
  }, [unreadNotifications, router]);
}
