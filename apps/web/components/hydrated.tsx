"use client";
import { useEffect } from "react";

/** Marks <html data-hydrated="1"> once React has hydrated (lets E2E tests wait before typing into controlled inputs). */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return null;
}
