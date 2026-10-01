"use client";

import { useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Table rows that open an item page (STD-NAV-002, VLT-43). A <tr> cannot be an
 * anchor, so each row also carries a real <Link> in its name cell (for
 * keyboard, middle-click and "open in new tab"); this handler makes the rest
 * of the row clickable too. Clicks that land on a control inside the row
 * (the select checkbox, the name link) are left to that control.
 */
export function useRowLink() {
  const router = useRouter();
  return useCallback(
    (e: MouseEvent<HTMLElement>, href: string) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, input, label, select, textarea")) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      router.push(href);
    },
    [router],
  );
}
