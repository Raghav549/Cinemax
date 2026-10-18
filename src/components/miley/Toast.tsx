"use client";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";

export default function MiLeyToast() {
  const { notice } = useMusic();
  return <div className={`miley-toast ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice && <><MusicIcon name="sparkle" /><span>{notice}</span></>}</div>;
}
