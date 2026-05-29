"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ReactNode } from "react";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function BrowserNotificationManager() {
  useBrowserNotifications();
  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <BrowserNotificationManager />
      {children}
    </ConvexAuthProvider>
  );
}
