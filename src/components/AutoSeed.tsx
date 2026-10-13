"use client";

import { useEffect } from "react";

const SEED_VERSION_KEY = "cinemax_catalog_v2_verified";

export default function AutoSeed() {
  useEffect(() => {
    try {
      if (localStorage.getItem(SEED_VERSION_KEY) === "1") return;
    } catch {
      return;
    }

    fetch("/api/seed", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          try {
            localStorage.setItem(SEED_VERSION_KEY, "1");
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
