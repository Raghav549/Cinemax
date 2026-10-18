import { redirect } from "next/navigation";

export default function LegacyMoviePage(): never {
  redirect("/explore");
}
