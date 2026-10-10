"use client";
import { useEffect } from "react";

export default function AutoSeed() {
  useEffect(() => {
    const seeded = localStorage.getItem("cinemax_seeded");
    if (!seeded) {
      fetch("/api/seed", { method: "POST" })
        .then(async (res) => {
          // Only remember success; if the DB wasn't ready, try again next visit.
          if (!res.ok) return;
          localStorage.setItem("cinemax_seeded", "1");
          const data = await res.json().catch(() => null);
          // First-ever seed: reload once so the freshly inserted movies show up.
          if (data?.message === "Seeded successfully") window.location.reload();
        })
        .catch(() => {});
    }
  }, []);
  return null;
}
