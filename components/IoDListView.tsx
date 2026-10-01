"use client";

import Link from "next/link";
import { useRowLink } from "@/lib/hooks/useRowLink";
import { IoDItem, CONDITION_COLORS, IOD_CATEGORY_LABELS } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";
import SelectionCheckbox from "@/components/SelectionCheckbox";
import SortableHeader from "@/components/forms/SortableHeader";
import RowThumb from "@/components/RowThumb";
import { TotalsRow } from "@/components/TotalsRow";

const fmtRaw = (price: number | null | undefined) => {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price));
};

const COLUMNS: { label: string; field?: string; align?: "left" | "right" }[] = [
  { label: "Description", field: "short_description" },
  { label: "Category", field: "category" },
  { label: "Brand", field: "brand" },
  { label: "Item Type", field: "item_type" },
  { label: "Year", field: "year" },
  { label: "Condition", field: "condition" },
  { label: "Buy Cost", field: "purchase_price" },
  { label: "AI Est.", field: "latest_ai_price" },
  { label: "My Value", field: "latest_user_price" },
  { label: "Insured", field: "insure" },
  { label: "Insured Value", field: "insurance_value" },
];

interface IoDListViewProps {
  items: IoDItem[];
  /** Item detail page for a row (STD-NAV-002). */
  itemHref: (item: IoDItem) => string;
  onDelete: (id: string) => void;
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, selected: boolean) => void;
  onSelectAllToggle?: () => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortToggle?: (field: string) => void;
}

export default function IoDListView({
  items,
  itemHref,
  selectedIds,
  onSelectChange,
  onSelectAllToggle,
  sortBy,
  sortDir,
  onSortToggle,
}: IoDListViewProps) {
  const { hideValues } = useHideValues();
  const openRow = useRowLink();
  const fmt = (price: number | null | undefined) => hideValues ? "$•••" : fmtRaw(price);

  const selectionEnabled = !!selectedIds && !!onSelectChange && !!onSelectAllToggle;
  const selectedCount = selectedIds?.size ?? 0;
  const headerState: boolean | "indeterminate" =
    selectedCount === 0 ? false : selectedCount === items.length ? true : "indeterminate";

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            {selectionEnabled && (
              <th className="px-4 py-3 w-10">
                <SelectionCheckbox state={headerState} onChange={onSelectAllToggle!} header />
              </th>
            )}
            <th className="px-4 py-3 w-14 text-left" />
            {COLUMNS.map((col) => (
              <SortableHeader
                key={col.label}
                label={col.label}
                field={onSortToggle ? col.field : undefined}
                currentSort={sortBy ?? ""}
                currentDir={sortDir ?? "desc"}
                onToggle={onSortToggle ?? (() => {})}
                align={col.align}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isSelected = selectedIds?.has(item.id) ?? false;
            return (
              <tr
                key={item.id}
                onClick={(e) => openRow(e, itemHref(item))}
                className={`group cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors ${
                  isSelected ? "bg-accent/5" : idx % 2 === 0 ? "bg-surface" : "bg-surface/60"
                }`}
              >
                {selectionEnabled && (
                  <td className="px-4 py-3 w-10">
                    <SelectionCheckbox
                      state={isSelected}
                      onChange={() => onSelectChange!(item.id, !isSelected)}
                    />
                  </td>
                )}
                <td className="px-4 py-3"><RowThumb images={item.images} /></td>
                <td className="px-4 py-3 text-text font-medium max-w-[200px] truncate"><Link href={itemHref(item)} className="hover:text-accent hover:underline underline-offset-2">{item.short_description}</Link></td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{IOD_CATEGORY_LABELS[item.category]}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.brand || "—"}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.item_type || "—"}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.year ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.condition ? (
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${CONDITION_COLORS[item.condition]}`}
                    >
                      {item.condition}
                    </span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text font-mono whitespace-nowrap">{fmt(item.purchase_price)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.latest_ai_price != null ? (
                    <span className="text-accent font-mono font-medium">{fmt(item.latest_ai_price)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.latest_user_price != null ? (
                    <span className="text-text font-mono font-medium">{fmt(item.latest_user_price)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                {/* Insured */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.insure ? (
                    <span className="text-accent text-xs font-medium">Yes</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                {/* Insured Value */}
                <td className="px-4 py-3 whitespace-nowrap font-mono">
                  {item.insurance_value != null ? (
                    <span className="text-text font-medium">{fmt(item.insurance_value)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* STD-TBL-002: totals over the rows shown (post search/filter). */}
        <TotalsRow columns={COLUMNS} items={items} fmt={fmt} leadingCells={(selectionEnabled ? 1 : 0) + 1} />
      </table>
    </div>
  );
}
