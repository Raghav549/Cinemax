"use client";

import { useRef, useState } from "react";
import Icon from "./Icon";

/**
 * The paste-a-link control used by Search and the /watch page. Purely
 * presentational: it hands the raw string up, and every string is validated by
 * the provider registry before anything tries to use it.
 */
export default function ShareLinkForm({
  id = "share-link-input",
  initialValue = "",
  onSubmit,
  autoFocus = false,
  label = "Movie or share link",
  placeholder = "https://…  YouTube, Hotstar, Netflix, or a direct video link",
  submitLabel = "Play",
}: {
  id?: string;
  initialValue?: string;
  onSubmit: (url: string) => void;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(initialValue);
  // Reset when the caller's value changes - adjusted during render (the
  // React-recommended pattern) instead of a cascading effect.
  const [lastInitial, setLastInitial] = useState(initialValue);
  if (initialValue !== lastInitial) {
    setLastInitial(initialValue);
    setValue(initialValue);
  }
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      className="share-link-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className="share-link-field">
        <Icon name="link" />
        <input
          id={id}
          ref={input}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={2048}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setValue(""); }}
        />
        {value && (
          <button className="icon-button search-clear" type="button" aria-label="Clear link" onClick={() => { setValue(""); input.current?.focus(); }}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <button className="cinematic-button share-link-submit" type="submit" disabled={!value.trim()}>
        <Icon name="play" filled /> {submitLabel}
      </button>
    </form>
  );
}
