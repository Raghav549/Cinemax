"use client";
import { useEffect } from "react";

export default function AutoSeed() {
  useEffect(() => {
    const seeded = localStorage.getItem("cinemax_seeded");
    if (!seeded) {
      fetch("/api/seed", { method: "POST" })
        .then(() => localStorage.setItem("cinemax_seeded", "1"))
        .catch(() => {});
    }
  }, []);
  return null;
}
