"use client";

// Item detail page (STD-NAV-002, VLT-43). Edit stays a modal, opened from here.
import ItemPage from "@/components/ItemPage";
import WatchDetail from "@/components/WatchDetail";
import { WatchItem, WATCH_CATEGORY_LABELS } from "@/lib/types";

const titleOf = (item: WatchItem) => [item.year, item.brand, item.model].filter(Boolean).join(" ");

export default function WatchDetailPage() {
  return (
    <ItemPage<WatchItem> module="watches" categoryLabels={WATCH_CATEGORY_LABELS} titleOf={titleOf}>
      {({ item, onDelete, onItemUpdated, onValuationSaved }) => (
        <WatchDetail
          item={item}
          onDelete={onDelete}
          onItemUpdated={onItemUpdated}
          onValuationSaved={onValuationSaved}
        />
      )}
    </ItemPage>
  );
}
