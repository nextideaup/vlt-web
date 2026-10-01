"use client";

// Item detail page (STD-NAV-002, VLT-43). Edit stays a modal, opened from here.
import ItemPage from "@/components/ItemPage";
import GuitarDetail from "@/components/GuitarDetail";
import { GuitarItem, CATEGORY_LABELS } from "@/lib/types";

const titleOf = (item: GuitarItem) => [item.year, item.brand, item.model].filter(Boolean).join(" ");

export default function GuitarDetailPage() {
  return (
    <ItemPage<GuitarItem> module="guitars" categoryLabels={CATEGORY_LABELS} titleOf={titleOf}>
      {({ item, onDelete, onItemUpdated, onValuationSaved }) => (
        <GuitarDetail
          item={item}
          onDelete={onDelete}
          onItemUpdated={onItemUpdated}
          onValuationSaved={onValuationSaved}
        />
      )}
    </ItemPage>
  );
}
