"use client";

import { useEffect } from "react";

export function DailyLogGuard() {
  useEffect(() => {
    const fired = sessionStorage.getItem("dialogue-daily-log-guard-fired");
    if (fired) return;
    sessionStorage.setItem("dialogue-daily-log-guard-fired", "1");

    fetch("/api/jobs/ensure-daily-log").catch(() => {});
  }, []);

  return null;
}
