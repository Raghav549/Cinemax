import { redirect } from "next/navigation";

export const metadata = { title: "Your library" };

export default function LegacyWatchlistPage(): never {
  redirect("/library");
}
