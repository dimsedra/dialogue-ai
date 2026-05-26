import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useRef, useCallback } from "react";

export function usePageSettings<T extends Record<string, any>>(
  page: "dashboard",
  defaults: T
): [T, (updates: Partial<T>) => void] {
  const serverData = useQuery(api.pageSettings.get, { page });
  const updateMutation = useMutation(api.pageSettings.update);

  // Local settings state
  const [localSettings, setLocalSettings] = useState<T>(defaults);

  // Refs to avoid stale closure issues in debounced save
  const latestLocalRef = useRef<T>(localSettings);
  latestLocalRef.current = localSettings;

  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialize local settings when server data loads
  useEffect(() => {
    if (serverData !== undefined) {
      setLocalSettings(serverData ? (serverData.settings as unknown as T) : defaults);
    }
  }, [serverData, defaults]);

  const update = useCallback((updates: Partial<T>) => {
    // Optimistically update local state immediately
    const nextSettings = { ...latestLocalRef.current, ...updates };
    setLocalSettings(nextSettings);

    // Debounce saving to the server (100ms)
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }

    debouncedSaveRef.current = setTimeout(async () => {
      try {
        await updateMutation({ page, settings: nextSettings as any });
      } catch (error) {
        console.error(`Failed to save settings for page ${page}:`, error);
      }
    }, 100);
  }, [page, updateMutation]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }
    };
  }, []);

  return [localSettings, update];
}
