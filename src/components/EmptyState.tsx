import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export default function EmptyState({ title, description, icon = "film", children, variant = "default" }: { title: string; description?: string; icon?: IconName; children?: ReactNode; variant?: "default" | "watchlist" }) {
  return <div className={`content-empty ${variant === "watchlist" ? "watchlist-empty" : ""}`}>
    <div className="empty-state-content">
      <div className="empty-art" aria-hidden="true"><span className="empty-art-orbit" /><span className="empty-art-card empty-art-card-back" /><span className="empty-art-card empty-art-card-front"><Icon name={icon} /></span><span className="empty-art-spark" /></div>
      <h2 className="empty-title">{title}</h2>
      {description && <p className="empty-copy">{description}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  </div>;
}
