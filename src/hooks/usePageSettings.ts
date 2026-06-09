import { useQuery, useMutation, useAuth, pageSettingsGetQuery, type PbPageSettings } from "@/pb-compat";
import { useCallback, useState, useEffect, useRef } from "react";

export function usePageSettings<T extends Record<string, any>>(
  page: "dashboard",
  defaults: T
): [T, (updates: Partial<T>) => void] {
  const { user } = useAuth();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 1. Reactive query to fetch page settings
  const pbSettingsRecord = useQuery(
    pageSettingsGetQuery,
    user ? { user: user.id, page } : undefined
  );

  // 2. Mutation hooks
  const mutate = useMutation<PbPageSettings>({
    collection: "page_settings",
    kind: "update",
  });
  const create = useMutation<PbPageSettings>({
    collection: "page_settings",
    kind: "create",
  });

  // 3. Local settings state for snappy client-side updates
  const [localSettings, setLocalSettings] = useState<T>(defaults);

  // Sync state when database settings load/change
  useEffect(() => {
    if (pbSettingsRecord?.settings) {
      setLocalSettings(pbSettingsRecord.settings as unknown as T);
    }
  }, [pbSettingsRecord]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateSettings = useCallback(
    (updates: Partial<T>) => {
      if (!user) return;
      
      const newSettings = { ...localSettings, ...updates };
      
      // Optimistic update for instant responsiveness
      setLocalSettings(newSettings);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(async () => {
        try {
          const pb = (await import("@/pb-compat/client")).getPbClient();
          
          // Find existing record — disable query auto-cancellation
          const list = await pb.collection("page_settings").getList(1, 1, {
            filter: `user = "${user.id}" && page = "${page}"`,
            requestKey: null,
          });
          const existing = list.items[0];

          if (existing) {
            await mutate({
              id: existing.id,
              record: {
                settings: newSettings as any,
              },
            });
          } else {
            await create({
              user: user.id as any,
              page,
              settings: newSettings as any,
            } as any);
          }
        } catch (err: any) {
          // Gracefully ignore auto-cancellation aborts from concurrent updates
          if (err?.isAbort) return;
          console.error("Failed to save page settings:", err);
        }
      }, 300); // 300ms debounce
    },
    [user, page, localSettings, mutate, create]
  );

  return [localSettings, updateSettings];
}
