import { redirect } from "next/navigation";

export const metadata = { title: "Explore" };

export default function LegacyCategoriesPage(): never {
  redirect("/explore");
}
