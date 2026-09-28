import type { BarView } from "@/components/BarWatch";
import { GuestChrome } from "@/components/GuestChrome";
import { BAR_NAME } from "@/lib/brand";

/**
 * What a guest sees on /menu and the cocktail, pour and wine pages while the bar is Closed (DESIGN §3.1):
 * the bar's name and "The bar is closed", in the guest frame with the gold accent. Same URL, HTTP 200,
 * never an error; it turns back into the page by itself when the bar opens (BarWatch).
 */
export function ClosedPage({ bar }: { bar: BarView }) {
  return (
    <div className="phone">
      <GuestChrome bar={bar} />
      <main className="closed-page">
        <h1 className="wordmark">{BAR_NAME}</h1>
        <span className="closed-rule" aria-hidden><i /></span>
        <p className="closed-text">The bar is closed</p>
      </main>
    </div>
  );
}
