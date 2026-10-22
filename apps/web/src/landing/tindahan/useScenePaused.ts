import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Spec 11.4: the scene draws no frames while the tab is hidden or the stage is scrolled out of view. */
export function useScenePaused(stage: RefObject<Element | null>): boolean {
  const hidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden, () => false);
  const [outOfView, setOutOfView] = useState(false);
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOutOfView(entry ? !entry.isIntersecting : false));
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage]);
  return hidden || outOfView;
}
