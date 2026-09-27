import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { absolute: "Hart & Ward" } };

/** Public front. A locksmith's shop, with nowhere to go but the door and the office. */
export default function ShopPage() {
  return (
    <main className="cover shop">
      <div className="shop-card">
        <p className="shop-kicker">Locksmiths</p>
        <h1>Hart &amp; Ward</h1>
        <p className="shop-trade">Locks, keys, and safes. Keys cut while you wait.</p>
        <nav className="shop-links" aria-label="Shop">
          <Link href="/contact">Contact us</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </div>
    </main>
  );
}
