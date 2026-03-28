import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 10; // px — minimum scroll delta to trigger a direction change
const ALWAYS_SHOW_ABOVE = 50; // px — always show bars near the top of the page
const DESKTOP_BREAKPOINT = 1024; // px — lg breakpoint (matches Tailwind's lg:)

/**
 * Returns "up" or "down" based on scroll direction.
 *
 * Rules:
 * - Always "up" when scrollY < ALWAYS_SHOW_ABOVE (bars visible at page top)
 * - Always "up" on desktop (≥ DESKTOP_BREAKPOINT) — bars never auto-hide on desktop
 * - Direction changes only when the user has scrolled more than THRESHOLD px since
 *   the last direction change, preventing jitter on small movements
 */
export default function useScrollDirection() {
  const [scrollDir, setScrollDir] = useState('up');
  const lastScrollY = useRef(typeof window !== 'undefined' ? window.scrollY : 0);
  const lastChangeY = useRef(lastScrollY.current);

  useEffect(() => {
    const isDesktop = () => window.innerWidth >= DESKTOP_BREAKPOINT;

    const onScroll = () => {
      const y = window.scrollY;

      // Always visible near the top or on desktop
      if (y < ALWAYS_SHOW_ABOVE || isDesktop()) {
        setScrollDir('up');
        lastScrollY.current = y;
        lastChangeY.current = y;
        return;
      }

      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      // Only register a direction change once threshold is exceeded
      if (Math.abs(y - lastChangeY.current) < THRESHOLD) return;

      const dir = delta > 0 ? 'down' : 'up';
      lastChangeY.current = y;
      setScrollDir(dir);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return scrollDir;
}
