import type { ReactNode } from "react";
import MusicIcon, { type MusicIconName } from "./Icon";

export default function EmptyState({ title, description, icon = "music", action }: { title: string; description: string; icon?: MusicIconName; action?: ReactNode }) {
  return <section className="empty-state" aria-live="polite">
    <span className="empty-state-icon"><MusicIcon name={icon} /></span>
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </section>;
}
