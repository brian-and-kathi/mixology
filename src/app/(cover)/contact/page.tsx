import type { Metadata } from "next";
import { Door } from "./Door";

export const metadata: Metadata = { title: { absolute: "Contact us · Hart & Ward" } };

export default function ContactPage() {
  return <Door />;
}
