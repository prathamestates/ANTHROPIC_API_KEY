/* ---------------------------------------------------------------------
   BARCODE PRODUCT LOOKUP (Stage 6)

   Uses Open Food Facts (https://openfoodfacts.org) — a free, keyless,
   public product database covering EAN/UPC barcodes for food and many
   household products. No credentials needed for this one; it's a public
   read-only API. Coverage isn't 100% (especially for non-food items),
   so a "not found" result is expected sometimes — the caller always
   falls back to manual entry rather than fabricating details.
--------------------------------------------------------------------- */
export async function lookupBarcodeProduct(barcode) {
  const clean = barcode.replace(/\D/g, "");
  if (!clean) return null;

  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json`);
  if (!response.ok) return null;
  const json = await response.json();
  if (json.status !== 1 || !json.product) return null;

  const p = json.product;
  return {
    barcode: clean,
    product: p.product_name || p.generic_name || "",
    brand: (p.brands || "").split(",")[0]?.trim() || "",
    category: (p.categories || "").split(",")[0]?.trim() || "",
    packSize: p.quantity || "",
    imageUrl: p.image_front_small_url || p.image_url || "",
  };
}
