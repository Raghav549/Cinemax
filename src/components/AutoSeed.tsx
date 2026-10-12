"use client";

import { useEffect } from "react";
import { CATALOGUE_REFRESH_EVENT } from "./CatalogueProvider";

export default function AutoSeed() {
  useEffect(() => {
    try { if (localStorage.getItem("cinemax_seeded") === "1") return; }
    catch { /* Storage restrictions must not break the app. */ }
    const controller = new AbortController();
    fetch("/api/seed", { method: "POST", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || controller.signal.aborted) return;
        try { localStorage.setItem("cinemax_seeded", "1"); } catch { /* Optional convenience. */ }
        const data = await response.json();
        // Re-read the real API instead of reloading the page or replaying the intro.
        if (data?.message === "Seeded successfully") window.dispatchEvent(new Event(CATALOGUE_REFRESH_EVENT));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return null;
}
