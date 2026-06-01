"use client";

import { useEffect } from "react";

export function ScrollEnabler() {
  useEffect(() => {
    document.documentElement.classList.add("allow-scroll");
    document.body.classList.add("allow-scroll");
    return () => {
      document.documentElement.classList.remove("allow-scroll");
      document.body.classList.remove("allow-scroll");
    };
  }, []);
  return null;
}
