import type { Metadata } from "next";
import { BarWatch } from "@/components/BarWatch";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { Door } from "./Door";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Contact us · Hart & Ward" } };

/**
 * The knock. While the bar is Closed (DESIGN §3.1) a guest gets the bare door: no keypad, no heading, no
 * message, nothing that says why. Admins get the keypad as usual. BarWatch swaps it when the status changes.
 */
export default async function ContactPage() {
  const gate = await guestGate();
  return (
    <>
      {gate.allowed ? <Door /> : <BareDoor />}
      <BarWatch {...publicStatus(gate)} />
    </>
  );
}

function BareDoor() {
  return (
    <main className="cover door-scene">
      <video className="door-video" src="/heavy_door_opening.mp4" muted playsInline preload="auto" aria-hidden />
    </main>
  );
}
