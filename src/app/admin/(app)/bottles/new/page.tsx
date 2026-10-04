import { BottleForm } from "@/components/admin/BottleForm";
import { countFeatured, loadDefaultWineSpec, loadFamilies, loadGrapes, loadSpecOptions } from "@/lib/admin-data";

export const metadata = { title: "Add bottle" };

export default async function NewBottlePage({ searchParams }: { searchParams: Promise<{ shared?: string; kind?: string }> }) {
  const { shared, kind } = await searchParams;
  const wine = kind === "wine";
  const [specs, families, wineSpec, featuredCount, grapes] = await Promise.all([loadSpecOptions(), loadFamilies(), wine ? loadDefaultWineSpec() : null, countFeatured(), loadGrapes()]);
  return (
    <BottleForm
      product={null}
      specs={specs}
      families={families}
      shared={shared === "1" ? true : shared === "0" ? false : null}
      wine={wine}
      presetSpecId={wineSpec}
      featuredCount={featuredCount}
      grapes={grapes}
    />
  );
}
