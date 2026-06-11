import { usePbProfile } from "@/pb-compat";

export function useTimeFormat(): "auto" | "12h" | "24h" {
  const profile = usePbProfile();
  return (profile?.preferences as any)?.timeFormat || "auto";
}
