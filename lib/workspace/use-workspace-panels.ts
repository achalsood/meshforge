"use client";

import { useCallback, useSyncExternalStore } from "react";

const EXPLORER_STORAGE_KEY = "meshforge:workspace:explorer-collapsed";
const ROOM_STORAGE_KEY = "meshforge:workspace:room-collapsed";

function getPreference(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

function subscribeToPreference(key: string, listener: () => void): () => void {
  const eventName = `meshforge-preference:${key}`;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(eventName, listener);
  };
}

function useStoredPanelPreference(key: string) {
  const subscribe = useCallback((listener: () => void) => subscribeToPreference(key, listener), [key]);
  const getSnapshot = useCallback(() => getPreference(key), [key]);
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = useCallback(() => {
    localStorage.setItem(key, String(!getPreference(key)));
    window.dispatchEvent(new Event(`meshforge-preference:${key}`));
  }, [key]);
  return [collapsed, toggle] as const;
}

export function useWorkspacePanels() {
  const [explorerCollapsed, toggleExplorer] = useStoredPanelPreference(EXPLORER_STORAGE_KEY);
  const [roomCollapsed, toggleRoom] = useStoredPanelPreference(ROOM_STORAGE_KEY);

  return { explorerCollapsed, roomCollapsed, toggleExplorer, toggleRoom };
}
