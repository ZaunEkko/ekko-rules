"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to its new value instead of jumping.
 *
 * The page polls its own status, so these numbers change while someone is
 * reading them — a fetch somewhere in the world lands and the total moves.
 * Showing that movement is the point; it is the one place the page is alive.
 * First paint never animates, and a reader who asked for reduced motion gets
 * the value directly.
 */
const DURATION_MS = 650;

export function Tally({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [bumped, setBumped] = useState(false);
  const previous = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from > value) {
      setShown(value);
      return;
    }

    setBumped(true);
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      // Ease out: the count slows as it arrives rather than stopping dead.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(step);
      }
    };
    frame.current = requestAnimationFrame(step);

    const settle = window.setTimeout(() => setBumped(false), DURATION_MS + 250);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      window.clearTimeout(settle);
    };
  }, [value]);

  return (
    <span className="tally" data-bumped={bumped ? "true" : "false"}>
      {shown.toLocaleString("en-US")}
    </span>
  );
}
