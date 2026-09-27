import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = { title: { absolute: "Hart & Ward" } };

const SERVICES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "Lockouts",
    text: "Homes, shops, and cars. We come to the door, day or night, and open the lock you already own.",
    icon: <LockIcon />,
  },
  {
    title: "Rekeying",
    text: "New pins in the cylinders you have, so yesterday's keys stop working. One key for the whole house if you want it.",
    icon: <PinsIcon />,
  },
  {
    title: "Keys cut",
    text: "House, padlock, and bit keys. Most are cut at the bench while you wait. We stamp a number on the bow if you ask.",
    icon: <KeyIcon />,
  },
  {
    title: "Deadbolts",
    text: "Grade 2 and Grade 1, single and double cylinder. Fitted, aligned, and tested with the key in the door.",
    icon: <BoltIcon />,
  },
  {
    title: "Commercial",
    text: "Storefront cylinders, panic hardware, and small master-key systems for a shop with more than one door.",
    icon: <StoreIcon />,
  },
  {
    title: "Safes",
    text: "Residential safes opened and combinations changed, when you can show the safe is yours. Lockboxes fitted.",
    icon: <SafeIcon />,
  },
];

const HOURS: [string, string][] = [
  ["Monday", "8:00 – 6:00"],
  ["Tuesday", "8:00 – 6:00"],
  ["Wednesday", "8:00 – 6:00"],
  ["Thursday", "8:00 – 6:00"],
  ["Friday", "8:00 – 6:00"],
  ["Saturday", "9:00 – 2:00"],
  ["Sunday", "Closed"],
];

/** Public front. A locksmith's shop, with nowhere to go but the door and the office. */
export default function ShopPage() {
  return (
    <main className="cover shop">
      <header className="shop-bar">
        <div className="shop-brand">
          <Mark />
          <div>
            <p className="shop-kicker">Locksmiths since 1978</p>
            <p className="shop-brand-name">Hart &amp; Ward</p>
          </div>
        </div>
        <nav className="shop-links" aria-label="Shop">
          <Link href="/contact">Contact us</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      <section className="shop-hero">
        <div>
          <h1>Locks, keys, and the doors they belong to.</h1>
          <p className="shop-lede">
            A bench shop. We cut keys, rekey cylinders, fit deadbolts, and open locks when the key is gone.
            Licensed and insured. Shop license HW-1978.
          </p>
          <ul className="shop-facts">
            <li>Keys cut while you wait</li>
            <li>Lockouts any hour</li>
            <li>We work on the lock, not around it</li>
          </ul>
        </div>
        <KeyHero />
      </section>

      <section className="shop-services" aria-labelledby="shop-services-title">
        <h2 id="shop-services-title">At the bench</h2>
        <ul>
          {SERVICES.map((service) => (
            <li key={service.title}>
              <span className="shop-ico" aria-hidden>{service.icon}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="shop-split">
        <div>
          <h2>The shop</h2>
          <p>14 Latch Lane. Street door, brass pull, the name in the glass. The bench is in the front window.</p>
          <p>Telephone 555-0148. Say what the lock is, and whether you are outside it.</p>
          <h3>On the bench</h3>
          <ul className="shop-plain">
            <li>Pin kits for the common house cylinders</li>
            <li>Brass and nickel blanks, including a short run of bit keys</li>
            <li>A code machine, impressioning files, and plug followers</li>
            <li>Deadbolts and a few storefront cylinders in the drawer</li>
          </ul>
        </div>
        <div>
          <h2>Hours</h2>
          <table className="shop-hours">
            <tbody>
              {HOURS.map(([day, time]) => (
                <tr key={day}>
                  <th scope="row">{day}</th>
                  <td>{time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="shop-note">Lockouts after closing: telephone the shop. Someone answers.</p>
        </div>
      </section>
    </main>
  );
}

function Mark() {
  return (
    <svg className="shop-mark" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M32 10v8M32 46v8M10 32h8M46 32h8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
    </svg>
  );
}

function KeyHero() {
  return (
    <svg className="shop-key" viewBox="0 0 220 440" role="img" aria-label="A house key">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        <circle cx="110" cy="78" r="48" />
        <circle cx="110" cy="78" r="18" />
        <path d="M110 126v230" />
        <path d="M110 250h36v18h-36M110 286h28v16h-28M110 322h42v18h-18v16h-24" />
      </g>
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <circle cx="16" cy="18" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M22 22l16 16M32 32l6-2M36 38l4-2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <rect x="12" y="20" width="24" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M17 20v-6a7 7 0 0 1 14 0v6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="24" cy="29" r="1.6" fill="currentColor" />
    </svg>
  );
}

function PinsIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <rect x="8" y="20" width="32" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 20v-8M24 20v-8M32 20v-8M16 12h0M24 12h0M32 12h0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <rect x="10" y="14" width="28" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="24" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M24 16v-4M18 24h-4M34 24h-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="M8 20 12 12h24l4 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 20h32v16H8z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 36V26h8v10" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SafeIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <rect x="10" y="10" width="28" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M24 17v3M24 28v3M17 24h3M28 24h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
