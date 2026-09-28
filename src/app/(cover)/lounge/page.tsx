import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { BarWatch } from "@/components/BarWatch";
import { guestGate, publicStatus } from "@/lib/bar-status";
import { dottedQrSvg } from "@/lib/qr-dots";
import { LOUNGE_COOKIE, loungeAllows, tonight } from "@/lib/night";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Lounge · Hart & Ward" } };

function cap(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default async function LoungePage() {
  // Closed (DESIGN §3.1): guests go back to the door, the same as with no lounge cookie (no hint). Admins stay.
  const gate = await guestGate();
  if (!gate.allowed) redirect("/contact");
  const jar = await cookies();
  const night = await tonight();
  if (!night || !(await loungeAllows(jar.get(LOUNGE_COOKIE)?.value))) redirect("/contact");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const local = host?.startsWith("localhost") || host?.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  const qr = host ? dottedQrSvg(`${proto}://${host}/menu`, { dark: "#ffffff", light: "#000000" }) : null;
  return (
    <main className="cover lounge">
      <BarWatch {...publicStatus(gate)} />
      <div className="lounge-panel">
        <div>
          <p className="lounge-kicker">Tonight&apos;s password</p>
          <p className="lounge-words">
            <span>{cap(night.words.color)}</span>
            <span>{cap(night.words.verb)}</span>
            <span>{cap(night.words.animal)}</span>
          </p>
          <p className="lounge-note">Say this at the door.</p>
        </div>
        {qr ? (
          <a className="lounge-qr" href="/menu" aria-label="Open the guest menu">
            <span className="lounge-qr-code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <span className="lounge-qr-label">Menu</span>
          </a>
        ) : null}
      </div>
    </main>
  );
}
