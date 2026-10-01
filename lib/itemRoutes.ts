// Item detail routes (STD-NAV-002, VLT-43).
//
// Every item has a page at /<module>/item/<id>. The static `item` segment sits
// beside each module's dynamic `[category]` segment; Next.js matches static
// segments first, and no category is called "item", so the two never collide.

export type ModuleSlug = "guitars" | "watches" | "automobiles" | "collectibles";

/** The dashboard API's `collection_type` values. */
export type CollectionType = "guitar" | "watch" | "auto" | "iod";

const MODULE_BY_TYPE: Record<CollectionType, ModuleSlug> = {
  guitar: "guitars",
  watch: "watches",
  auto: "automobiles",
  iod: "collectibles",
};

/** Human label for each module, as the sidebar and list headers show it. */
export const MODULE_LABELS: Record<ModuleSlug, string> = {
  guitars: "Guitars",
  watches: "Watches",
  automobiles: "Automobiles",
  collectibles: "Collectibles",
};

/** API base for each module (collectibles live under /api/iod). */
export const MODULE_API_BASE: Record<ModuleSlug, string> = {
  guitars: "/api/guitars",
  watches: "/api/watches",
  automobiles: "/api/automobiles",
  collectibles: "/api/iod",
};

export function itemHref(module: ModuleSlug, id: string): string {
  return `/${module}/item/${encodeURIComponent(id)}`;
}

export function categoryHref(module: ModuleSlug, category: string): string {
  return `/${module}/${category}`;
}

/** Item page for a dashboard / insurance-schedule row, or null for an unknown type. */
export function itemHrefForType(type: string, id: string): string | null {
  const slug = MODULE_BY_TYPE[type as CollectionType];
  return slug ? itemHref(slug, id) : null;
}
