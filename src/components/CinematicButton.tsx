import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes, ReactNode } from "react";

/** SVG follows the actual rounded perimeter, not a rotating rectangular highlight. */
export function ButtonLight() {
  return <span className="button-light" aria-hidden="true"><svg width="100%" height="100%">
    <rect className="light-tail" x="1" y="1" rx="25" pathLength="100" />
    <rect className="light-body" x="1" y="1" rx="25" pathLength="100" />
    <rect className="light-head" x="1" y="1" rx="25" pathLength="100" />
  </svg></span>;
}

function Content({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <><ButtonLight /><span className="button-content">{icon}{children}</span></>;
}

type LinkProps = ComponentProps<typeof Link> & { variant?: "primary" | "secondary"; icon?: ReactNode };
export function CinematicLink({ children, className = "", variant = "primary", icon, ...props }: LinkProps) {
  return <Link className={`cinematic-button ${variant === "secondary" ? "button-secondary" : ""} ${className}`} {...props}><Content icon={icon}>{children}</Content></Link>;
}

export default function CinematicButton({ children, className = "", variant = "primary", icon, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; icon?: ReactNode }) {
  return <button type={type} className={`cinematic-button ${variant === "secondary" ? "button-secondary" : ""} ${className}`} {...props}><Content icon={icon}>{children}</Content></button>;
}
