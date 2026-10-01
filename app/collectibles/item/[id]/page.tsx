"use client";

// Item detail page (STD-NAV-002, VLT-43). Edit stays a modal, opened from here.
import ItemPage from "@/components/ItemPage";
import IoDDetail from "@/components/IoDDetail";
import { IoDItem, IOD_CATEGORY_LABELS } from "@/lib/types";

const titleOf = (item: IoDItem) => item.short_description || [item.brand, item.item_type].filter(Boolean).join(" ") || "Item";

export default function IoDDetailPage() {
  return (
    <ItemPage<IoDItem> module="collectibles" categoryLabels={IOD_CATEGORY_LABELS} titleOf={titleOf}>
      {({ item, onDelete, onItemUpdated, onValuationSaved }) => (
        <IoDDetail
          item={item}
          onDelete={onDelete}
          onItemUpdated={onItemUpdated}
          onValuationSaved={onValuationSaved}
        />
      )}
    </ItemPage>
  );
}
