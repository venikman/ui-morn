import { useEffect, useRef, useState } from "react";

export const useSpinnerDelay = (
  isLoading: boolean,
  showDelayMs = 200,
  minVisibleMs = 400
) => {
  const [isVisible, setIsVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const delayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (delayTimeout.current) {
        clearTimeout(delayTimeout.current);
      }
      delayTimeout.current = setTimeout(() => {
        setIsVisible(true);
        shownAtRef.current = Date.now();
      }, showDelayMs);
    } else {
      if (delayTimeout.current) {
        clearTimeout(delayTimeout.current);
      }
      if (!isVisible) {
        return;
      }
      const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : 0;
      const remaining = Math.max(minVisibleMs - elapsed, 0);
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
      hideTimeout.current = setTimeout(() => {
        setIsVisible(false);
        shownAtRef.current = null;
      }, remaining);
    }

    return () => {
      if (delayTimeout.current) {
        clearTimeout(delayTimeout.current);
      }
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
    };
  }, [isLoading, isVisible, minVisibleMs, showDelayMs]);

  return isVisible;
};
