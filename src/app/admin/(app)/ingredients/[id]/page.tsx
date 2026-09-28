import { notFound } from "next/navigation";
import { SpecForm } from "@/components/admin/SpecForm";
import { loadFamilies, loadSpec } from "@/lib/admin-data";
import { isUuid } from "@/lib/db";

export const metadata = { title: "Spec" };

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [spec, families] = await Promise.all([loadSpec(id), loadFamilies()]);
  if (!spec) notFound();
  return <SpecForm key={spec.id} spec={spec} families={families} />;
}
