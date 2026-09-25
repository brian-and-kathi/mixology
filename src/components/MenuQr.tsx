import { headers } from "next/headers";
import QRCode from "qrcode";
import type { ReactNode } from "react";

/**
 * QR pointing at this host's /menu, built from the request host so it works on any deploy URL.
 * `above` (the build hash on the TV) sits centered over the code, in the same column as the caption.
 */
export async function MenuQr({ above }: { above?: ReactNode } = {}) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return above ? <aside className="tv-qr">{above}</aside> : null;
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  const svg = await QRCode.toString(`${proto}://${host}/menu`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#ffffff", light: "#000000" },
  });
  return (
    <aside className="tv-qr">
      {above}
      <div className="tv-qr-code" role="img" aria-label="QR code for the guest menu" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Scan for recipes</p>
    </aside>
  );
}
