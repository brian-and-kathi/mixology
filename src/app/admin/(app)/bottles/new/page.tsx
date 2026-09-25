import { BottleForm } from "@/components/admin/BottleForm";
import { loadFamilies, loadSpecOptions } from "@/lib/admin-data";

export const metadata = { title: "Add bottle" };

export default async function NewBottlePage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const { shared } = await searchParams;
  const [specs, families] = await Promise.all([loadSpecOptions(), loadFamilies()]);
  return <BottleForm product={null} specs={specs} families={families} shared={shared === "1" ? true : shared === "0" ? false : null} />;
}
