import { headers } from "next/headers";
import type { ReactNode } from "react";
import { dottedQrSvg } from "@/lib/qr-dots";

/**
 * QR pointing at this host's /menu, built from the request host so it works on any deploy URL.
 * `above` (the build hash on the TV) sits centered over the code, in the same column as the caption.
 * Drawn as dots with solid rounded finders and error correction Q (lib/qr-dots). The code fills its box; the
 * black page is its quiet zone, and --qr-n (modules across, set on .tv) sizes the 4-module gaps around it in CSS.
 * `dim` (bar Closed): the code and its caption are dimmed; `above` (the hash) is not.
 */
export async function MenuQr({ above, dim = false }: { above?: ReactNode; dim?: boolean } = {}) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return above ? <aside className="tv-qr">{above}</aside> : null;
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  const { svg, modules } = dottedQrSvg(`${proto}://${host}/menu`, { dark: "#ffffff", light: "#000000" });
  return (
    <aside className={dim ? "tv-qr tv-qr-dim" : "tv-qr"}>
      {/* On the whole TV (not just this block): the board shortens a row rule by 4 modules during a cast. */}
      <style>{`.tv { --qr-n: ${modules}; }`}</style>
      {above}
      <div className="tv-qr-code" role="img" aria-label="QR code for the guest menu" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>Scan for recipes</p>
    </aside>
  );
}
