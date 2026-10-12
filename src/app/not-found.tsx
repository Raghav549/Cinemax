import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import { CinematicLink } from "@/components/CinematicButton";

export default function NotFound() {
  return <main className="secondary-page" id="main-content" tabIndex={-1}><EmptyState title="Page not found" description="Let’s get you back to the library." icon="film"><CinematicLink href="/" icon={<Icon name="arrow-left" />}>Back to Home</CinematicLink></EmptyState></main>;
}
