"use client";

// Item detail page (STD-NAV-002, VLT-43). Edit stays a modal, opened from here.
import ItemPage from "@/components/ItemPage";
import AutomobileDetail from "@/components/AutomobileDetail";
import { AutoItem, AUTO_CATEGORY_LABELS } from "@/lib/types";

const titleOf = (item: AutoItem) => [item.year, item.brand, item.model].filter(Boolean).join(" ");

export default function AutomobileDetailPage() {
  return (
    <ItemPage<AutoItem> module="automobiles" categoryLabels={AUTO_CATEGORY_LABELS} titleOf={titleOf}>
      {({ item, onDelete, onItemUpdated, onValuationSaved }) => (
        <AutomobileDetail
          item={item}
          onDelete={onDelete}
          onItemUpdated={onItemUpdated}
          onValuationSaved={onValuationSaved}
        />
      )}
    </ItemPage>
  );
}
