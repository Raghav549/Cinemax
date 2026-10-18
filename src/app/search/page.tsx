import { redirect } from "next/navigation";

export const metadata = { title: "Explore music" };

export default function LegacySearchPage(): never {
  redirect("/explore");
}
