"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_TOAST_DURATION_MS = 2_400;

export function useWorkspaceNotifications() {
  const [toast, setToast] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string, duration = DEFAULT_TOAST_DURATION_MS) => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast(message);
    timeout.current = setTimeout(() => {
      setToast("");
      timeout.current = null;
    }, duration);
  }, []);

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  return { flash, toast };
}
