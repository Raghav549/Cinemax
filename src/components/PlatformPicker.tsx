"use client";

import { memo, useCallback } from "react";
import PlatformLogo from "./PlatformLogo";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

/**
 * Multi-select of "Available streaming platforms" for the studio.
 *
 * The selection is persisted through the existing catalogue `category` token
 * list as `platform-*` tokens (see src/lib/platforms.ts) — no database table,
 * column, migration or record is introduced or rewritten. Every other token in
 * the field is preserved exactly as it was.
 */
function PlatformPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly string[];
  onChange: (next: PlatformId[]) => void;
  disabled?: boolean;
}) {
  const toggle = useCallback(
    (id: PlatformId) => {
      const current = new Set(value);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      onChange(PLATFORMS.filter((platform) => current.has(platform.id)).map((platform) => platform.id));
    },
    [value, onChange]
  );

  return (
    <div className="platform-picker" role="group" aria-label="Available streaming platforms">
      <div className="platform-picker-head">
        <span className="platform-picker-label">Available streaming platforms</span>
        <span className="platform-picker-count">
          {value.length ? `${value.length} selected` : "None selected"}
        </span>
      </div>
      <div className="platform-picker-grid">
        {PLATFORMS.map((platform) => {
          const selected = value.includes(platform.id);
          return (
            <button
              key={platform.id}
              type="button"
              className={`platform-pick ${selected ? "is-selected" : ""}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(platform.id)}
            >
              <span className="platform-pick-logo">
                <PlatformLogo id={platform.id} eager />
              </span>
              <span className="platform-pick-name">{platform.name}</span>
              <span className="platform-pick-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
      <p className="platform-picker-note">
        Saved as <code>platform-*</code> tags alongside the existing category tokens — the database
        schema and all other fields are untouched.
      </p>
    </div>
  );
}

export default memo(PlatformPicker);
