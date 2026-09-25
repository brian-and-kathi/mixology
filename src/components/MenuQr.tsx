import { headers } from "next/headers";
import type { ReactNode } from "react";
import { dottedQrSvg } from "@/lib/qr-dots";

/**
 * QR pointing at this host's /menu, built from the request host so it works on any deploy URL.
 * `above` (the build hash on the TV) sits centered over the code, in the same column as the caption.
 * Drawn as dots with solid rounded finders, error correction Q and a 4-module quiet zone (lib/qr-dots).
 */
export async function MenuQr({ above }: { above?: ReactNode } = {}) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return above ? <aside className="tv-qr">{above}</aside> : null;
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  const { svg } = dottedQrSvg(`${proto}://${host}/menu`, { dark: "#ffffff", light: "#000000" });
  return (
    <aside className="tv-qr">
      {above}
      <div className="tv-qr-code" role="img" aria-label="QR code for the guest menu" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Scan for recipes</p>
    </aside>
  );
}
