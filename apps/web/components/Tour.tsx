"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Thin driver.js wrapper. Auto-starts once per storage key on first visit (when
 * `active` turns true), respects prefers-reduced-motion, filters steps to
 * elements actually in the DOM, and returns `startTour` so a "?" / "Tour"
 * control can replay it on demand. SSR-safe (all DOM access guarded).
 */
export function useGuidedTour({
  steps,
  storageKey,
  active,
}: {
  steps: DriveStep[];
  storageKey: string;
  active: boolean;
}) {
  const autoStarted = useRef(false);

  const startTour = useCallback(() => {
    if (typeof document === "undefined") return;
    const present = steps.filter(
      (s) => typeof s.element !== "string" || document.querySelector(s.element),
    );
    if (present.length === 0) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    driver({
      showProgress: true,
      animate: !reduceMotion,
      allowClose: true,
      overlayOpacity: 0.6,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Got it",
      steps: present,
    }).drive();
  }, [steps]);

  useEffect(() => {
    if (!active || autoStarted.current) return;
    let seen = false;
    try {
      seen = localStorage.getItem(storageKey) === "1";
    } catch {
      seen = false; // storage unavailable → show it, just don't persist
    }
    if (seen) return;
    autoStarted.current = true;
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    // Let the report finish painting before spotlighting.
    const timer = setTimeout(startTour, 500);
    return () => clearTimeout(timer);
  }, [active, storageKey, startTour]);

  return { startTour };
}
