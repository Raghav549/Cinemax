/**
 * The "More" discovery icon: an original animated mark, rendered as inline SVG.
 *
 * One seamless 3.8s loop (CSS transforms/opacity only — no blur filters, no
 * canvas, no timers):
 *   1. three luminous dots rest in a circular arrangement inside a ring;
 *   2. pressure cracks race across the ring while the dots vibrate;
 *   3. the ring bursts into small luminous fragments;
 *   4. the dots roll rapidly to the left, spinning with motion trails;
 *   5. a bright blue→violet→pink light streak crosses the icon;
 *   6. fragments and dots converge and reform the exact original arrangement.
 *
 * When the More panel is open (`data-open`) the loop settles to its resting
 * frame immediately, and `prefers-reduced-motion` disables the loop entirely
 * (see globals.css). The icon is decorative: the button supplies the label.
 */
export default function MoreIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      className={`more-icon${open ? " is-open" : ""}`}
      viewBox="0 0 48 48"
      width="26"
      height="26"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="more-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4fd8ff" />
          <stop offset="48%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ff4fa3" />
        </linearGradient>
        <linearGradient id="more-streak-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4fd8ff" stopOpacity="0" />
          <stop offset="35%" stopColor="#4fd8ff" />
          <stop offset="62%" stopColor="#c084fc" />
          <stop offset="85%" stopColor="#ff4fa3" />
          <stop offset="100%" stopColor="#ff4fa3" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="more-glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="more-glow" cx="24" cy="24" r="19" fill="url(#more-glow-grad)" />

      {/* Ring that cracks, bursts and reforms */}
      <g className="more-ring">
        <circle cx="24" cy="24" r="14.5" fill="none" stroke="url(#more-ring-grad)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="68 23" transform="rotate(-72 24 24)" />
        <circle cx="24" cy="24" r="14.5" fill="none" stroke="url(#more-ring-grad)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="14 77" strokeDashoffset="-74" transform="rotate(-72 24 24)" opacity="0.9" />
      </g>

      {/* Pressure cracks */}
      <g className="more-cracks" fill="none" strokeLinecap="round">
        <path d="M24 9.5 22.6 14l2.4 2.2-1.6 3" stroke="#bae6fd" strokeWidth="1.3" />
        <path d="M36.8 30.5 32.8 28.6l-3 .8-2.4-1.6" stroke="#f0abfc" strokeWidth="1.3" />
        <path d="M11.2 30.5 15.2 28.6l3 .8 2.4-1.6" stroke="#c4b5fd" strokeWidth="1.3" />
      </g>

      {/* Burst fragments (each flies to its own --fx/--fy, then returns) */}
      <g className="more-fragments">
        <path className="more-frag" style={{ "--fx": "-9px", "--fy": "-10px", "--fr": "-70deg" } as React.CSSProperties} d="M23 8.6 25.4 11 22.8 11.8Z" fill="#4fd8ff" />
        <path className="more-frag" style={{ "--fx": "10px", "--fy": "-7px", "--fr": "80deg" } as React.CSSProperties} d="M35 15.5 34.2 18.6 31.8 16.8Z" fill="#a78bfa" />
        <path className="more-frag" style={{ "--fx": "11px", "--fy": "7px", "--fr": "120deg" } as React.CSSProperties} d="M36.5 27 33.6 28.2 34.4 25.4Z" fill="#ff4fa3" />
        <path className="more-frag" style={{ "--fx": "5px", "--fy": "11px", "--fr": "-110deg" } as React.CSSProperties} d="M28.5 37.2 26.8 34.6 29.8 34.2Z" fill="#f472b6" />
        <path className="more-frag" style={{ "--fx": "-6px", "--fy": "11px", "--fr": "95deg" } as React.CSSProperties} d="M19.5 37.2 21.2 34.6 18.2 34.2Z" fill="#38bdf8" />
        <path className="more-frag" style={{ "--fx": "-11px", "--fy": "6px", "--fr": "-85deg" } as React.CSSProperties} d="M11.5 27 14.4 28.2 13.6 25.4Z" fill="#818cf8" />
        <path className="more-frag" style={{ "--fx": "-10px", "--fy": "-8px", "--fr": "60deg" } as React.CSSProperties} d="M13.5 15.8 15.8 17.4 13 18Z" fill="#e879f9" />
        <circle className="more-frag" style={{ "--fx": "2px", "--fy": "-12px", "--fr": "40deg" } as React.CSSProperties} cx="24" cy="9" r="1.3" fill="#fda4af" />
      </g>

      {/* Fast light streak */}
      <g className="more-streak">
        <rect x="-14" y="22.4" width="34" height="3.2" rx="1.6" fill="url(#more-streak-grad)" transform="rotate(-14 3 24)" />
        <circle cx="17" cy="20.6" r="1.7" fill="#e0f2fe" />
      </g>

      {/* The three dots: vibrate, scatter, roll left, then reform */}
      <g className="more-dot more-dot-1">
        <circle cx="24" cy="16.5" r="3.4" fill="#38bdf8" />
        <circle cx="22.9" cy="15.4" r="1.05" fill="#e0f2fe" />
      </g>
      <g className="more-dot more-dot-2">
        <circle cx="17.5" cy="27.8" r="3.4" fill="#a78bfa" />
        <circle cx="16.4" cy="26.7" r="1.05" fill="#ede9fe" />
      </g>
      <g className="more-dot more-dot-3">
        <circle cx="30.5" cy="27.8" r="3.4" fill="#ff4fa3" />
        <circle cx="29.4" cy="26.7" r="1.05" fill="#ffe4e6" />
      </g>
    </svg>
  );
}
