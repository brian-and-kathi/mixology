import Link from "next/link";
import { loadStock } from "@/lib/admin-data";
import { BottleList } from "@/components/admin/BottleList";

export const metadata = { title: "Bottles" };

export default async function BottlesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const items = await loadStock();
  return (
    <>
      <div className="a-titlebar">
        <h1 className="a-h1">Bottles</h1>
        <Link href="/admin/bottles/new" className="a-btn a-btn-primary">Add bottle</Link>
      </div>
      {saved ? <p className="a-ok" role="status">Saved {saved}.</p> : null}
      <BottleList items={items} />
    </>
  );
}
