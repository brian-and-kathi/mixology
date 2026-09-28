import { redirect } from "next/navigation";

/** The Bottles list is gone (its rows live on Stock): old links land on Stock, keeping a "Saved X." notice. */
export default async function BottlesRedirect({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  redirect(saved ? `/admin?saved=${encodeURIComponent(saved)}` : "/admin");
}
