// Single source for the reel: InsuWork tokens (apps/web/tailwind.config.ts), easings, springs.
import { Easing } from "remotion";

export const theme = {
  colors: {
    bg: "#08090a",
    surface: "#0f1011",
    edge: "rgba(255,255,255,0.08)",
    text: "#f7f8f8",
    textDim: "#8a8f98",
    primary: "#e4f222", // hero: the focus ring only, one element per frame
    glow: "rgba(228,242,34,0.35)",
    mesh: "#5e6ad2",
    meshAlt: "#8a8f98",
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    calm: { damping: 200 },
  },
  size: { width: 1600, height: 1000, fps: 30 },
  timing: { scene: 126, transition: 18, exit: 12 },
} as const;
