"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PlatformLogo from "./PlatformLogo";
import Icon from "./Icon";
import useReducedMotion from "@/hooks/useReducedMotion";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

interface Edges {
  start: boolean;
  end: boolean;
}

/**
 * Streaming-platform navigation for the home page.
 *
 * Horizontally scrollable, one row of official brand logos. Selecting a logo
 * filters the catalogue through the existing `matchesCollection` pipeline
 * (the platform is stored/filtered as a catalogue token), and selecting the
 * same logo again returns to the default rails. Nothing is invented: a
 * platform with no titles in the library is simply greyed out and reports a
 * zero count.
 */
function PlatformRail({
  active,
  counts,
  onSelect,
}: {
  active: PlatformId | null;
  counts: Record<string, number>;
  onSelect: (id: PlatformId | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef<Edges>({ start: true, end: false });
  const [edges, setEdges] = useState<Edges>({ start: true, end: false });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      frame.current = null;
      const next = {
        start: track.scrollLeft <= 2,
        end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 2,
      };
      if (next.start === latest.current.start && next.end === latest.current.end) return;
      latest.current = next;
      setEdges(next);
    };
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(track);
    track.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      observer?.disconnect();
      track.removeEventListener("scroll", schedule);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const nudge = useCallback(
    (direction: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollBy({
        left: direction * Math.max(track.clientWidth * 0.72, 240),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [reducedMotion]
  );

  return (
    <section className="platform-rail" aria-label="Browse by streaming platform">
      <div className="platform-rail-head">
        <div className="platform-rail-heading">
          <h2 className="platform-rail-title">Streaming platforms</h2>
          <p className="platform-rail-hint">
            {active ? "Showing one platform · select it again to see everything" : "Where your library is available to stream"}
          </p>
        </div>
        <div className="platform-rail-actions">
          <button
            className="icon-button platform-arrow"
            type="button"
            aria-label="Scroll platforms left"
            disabled={edges.start}
            onClick={() => nudge(-1)}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            className="icon-button platform-arrow"
            type="button"
            aria-label="Scroll platforms right"
            disabled={edges.end}
            onClick={() => nudge(1)}
          >
            <Icon name="chevron-right" />
          </button>
          <Link className="browse-all" href="/categories" aria-label="Explore all collections">
            <Icon name="explore" />
          </Link>
        </div>
      </div>
      <div
        className="platform-track hide-scrollbar"
        ref={trackRef}
        role="group"
        aria-label="Streaming platforms"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            nudge(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {PLATFORMS.map((platform, index) => {
          const count = counts[platform.id] ?? 0;
          const selected = active === platform.id;
          return (
            <button
              key={platform.id}
              type="button"
              className={`platform-orbit ${selected ? "is-selected" : ""} ${count === 0 ? "is-empty" : ""}`}
              aria-pressed={selected}
              aria-label={`${platform.name}${count > 0 ? `, ${count} ${count === 1 ? "title" : "titles"}` : ", no titles yet"}`}
              onClick={() => onSelect(selected ? null : platform.id)}
            >
              <span className="platform-orbit-disc">
                {/* Only the discs that are actually on screen at first paint
                    load eagerly; the rest decode as the row is scrolled. */}
                <PlatformLogo id={platform.id} className="platform-orbit-logo" eager={index < 6} />
              </span>
              <span className="platform-orbit-name">{platform.name}</span>
              <span className="platform-orbit-count">{count > 0 ? count : "—"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(PlatformRail);
