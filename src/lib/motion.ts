// src/lib/motion.ts
// Single source of truth for all Framer Motion constants.
// Import from here — never define durations or easings inline.

/** Duration in seconds */
export const duration = {
  fast: 0.15,  // micro-interactions, hover feedback
  base: 0.25,  // default transitions
  slow: 0.4,   // page-level, larger elements
} as const;

/** Cubic bezier easing curves */
export const ease = {
  out: [0.0, 0.0, 0.2, 1],      // elements entering the screen
  in: [0.4, 0.0, 1, 1],          // elements leaving the screen
  inOut: [0.4, 0.0, 0.2, 1],     // bidirectional transitions
} as const;

/** Spring config for interactive elements */
export const spring = {
  type: "spring",
  stiffness: 300,
  damping: 30,
} as const;

/** Fade up: element enters from slightly below */
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
} as const;

/** Fade in: opacity only */
export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
} as const;

/** Scale in: slight scale + opacity */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
} as const;

/** Returns a stagger container variant */
export function staggerContainer(stagger = 0.08) {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger } },
  };
}

/** Default transition using base duration + out easing */
export const defaultTransition = {
  duration: duration.base,
  ease: ease.out,
} as const;

/** Slow transition for page-level elements */
export const slowTransition = {
  duration: duration.slow,
  ease: ease.out,
} as const;
