import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOUNGE_COOKIE, loungeAllows, tonight } from "@/lib/night";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Lounge · Hart & Ward" } };

function cap(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default async function LoungePage() {
  const jar = await cookies();
  const night = tonight();
  if (!night || !loungeAllows(jar.get(LOUNGE_COOKIE)?.value)) redirect("/contact");
  return (
    <main className="cover lounge">
      <p className="lounge-kicker">Tonight&apos;s password</p>
      <p className="lounge-words">
        <span>{cap(night.words.color)}</span>
        <span>{cap(night.words.verb)}</span>
        <span>{cap(night.words.animal)}</span>
      </p>
      <p className="lounge-note">Say this at the door.</p>
    </main>
  );
}
