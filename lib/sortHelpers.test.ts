import { describe, expect, it } from "vitest";

import { bestPriceOf, compareBrandThenYear, compareValues, conditionOrdinal } from "@/lib/sortHelpers";

// VLT-69: the comparators the four category pages sort their tables with.

const sortBy = (values: unknown[]) => [...values].sort(compareValues);

describe("compareValues", () => {
  it("puts missing values after defined ones", () => {
    expect(sortBy([null, 2, "", undefined, 1])).toEqual([1, 2, null, "", undefined]);
  });

  it("sorts numeric strings as numbers, so pg NUMERIC columns order by value", () => {
    expect(sortBy(["1050.00", "300.00", "99.5"])).toEqual(["99.5", "300.00", "1050.00"]);
  });

  it("sorts YYYY-MM-DD strings by date and other strings by locale", () => {
    expect(sortBy(["2024-03-01", "2023-12-31"])).toEqual(["2023-12-31", "2024-03-01"]);
    expect(sortBy(["banana", "Apple"])).toEqual(["Apple", "banana"]);
  });

  it("orders false before true", () => {
    expect(sortBy([true, false])).toEqual([false, true]);
  });
});

describe("the per-page helpers", () => {
  it("ranks Condition with Mint best and unknown lowest", () => {
    expect(conditionOrdinal("Mint")).toBeGreaterThan(conditionOrdinal("Poor"));
    expect(conditionOrdinal("Nonsense")).toBe(0);
    expect(conditionOrdinal(null)).toBe(0);
  });

  it("takes the best available price: latest AI, then latest user, then purchase", () => {
    expect(bestPriceOf({ latest_ai_price: 10, latest_user_price: 20, purchase_price: 30 })).toBe(10);
    expect(bestPriceOf({ latest_user_price: 20, purchase_price: 30 })).toBe(20);
    expect(bestPriceOf({ purchase_price: 30 })).toBe(30);
    expect(bestPriceOf({})).toBe(0);
  });

  it("breaks a brand tie by year", () => {
    const items = [
      { brand: "Rolex", year: 1990 },
      { brand: "Omega", year: 2001 },
      { brand: "Rolex", year: 1970 },
    ];
    expect([...items].sort(compareBrandThenYear)).toEqual([
      { brand: "Omega", year: 2001 },
      { brand: "Rolex", year: 1970 },
      { brand: "Rolex", year: 1990 },
    ]);
  });
});
