import { headers } from "next/headers";
import QRCode from "qrcode";

/** QR pointing at this host's /menu, built from the request host so it works on any deploy URL. */
export async function MenuQr() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
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
      <div className="tv-qr-code" role="img" aria-label="QR code for the guest menu" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Scan for recipes</p>
    </aside>
  );
}
