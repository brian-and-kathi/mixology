import { notFound } from "next/navigation";
import { BottleForm } from "@/components/admin/BottleForm";
import { countFeatured, loadFamilies, loadProduct, loadSpecOptions } from "@/lib/admin-data";
import { isUuid } from "@/lib/db";

export const metadata = { title: "Edit bottle" };

export default async function EditBottlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [product, specs, families, featuredCount] = await Promise.all([loadProduct(id), loadSpecOptions(), loadFamilies(), countFeatured()]);
  if (!product) notFound();
  return <BottleForm product={product} specs={specs} families={families} shared={null} featuredCount={featuredCount} />;
}
