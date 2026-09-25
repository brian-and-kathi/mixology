import { redirect } from "next/navigation";

/** Stable deep link for the guest menu's "Bar admin": Stock lives at /admin. */
export default function StockAlias() {
  redirect("/admin");
}
