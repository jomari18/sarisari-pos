import { useEffect, useRef, type RefObject } from "react";

/**
 * Spec 11.4: how far the camera has moved toward the window, from 0 to 1. The move starts when the stage's
 * middle passes the middle of the screen (or with the first scroll, if it starts above it) and ends as the
 * stage leaves the top.
 */
export function scrollProgress(stage: { top: number; height: number }, viewportHeight: number, scrollY: number): number {
  const middle = stage.top + stage.height / 2;
  const start = Math.min(middle + scrollY, viewportHeight / 2);
  const end = -stage.height / 2;
  return Math.min(1, Math.max(0, (start - middle) / (start - end)));
}

/** The stage's scroll progress, kept in a ref so scrolling never re-renders React; the scene reads it each frame. */
export function useScrollProgress(stage: RefObject<Element | null>): RefObject<number> {
  const progress = useRef(0);
  useEffect(() => {
    const measure = () => {
      const node = stage.current;
      if (node) progress.current = scrollProgress(node.getBoundingClientRect(), window.innerHeight, window.scrollY);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [stage]);
  return progress;
}
