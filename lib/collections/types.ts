// Per-module config consumed by lib/collection-handler.ts. Each of the four
// collection modules (guitars, watches, automobiles, iod) exports one of these
// to drive its list/[id] route handlers.

export interface FieldSpec {
  name: string;
  required?: boolean;
  trim?: boolean;
  // Field type discriminator. Defaults to "string" (current normalize behaviour).
  // "boolean" bypasses the `value || null` coercion in normalizeField so that
  // `false` survives the round-trip — critical for the NOT NULL `insure` column
  // added by CUR-2 (migration 016). It is optional in a request body: when
  // absent, POST omits the column so the DB default applies; when present it
  // must be a JSON boolean or the request is a 400 (VLT-64).
  // "jsonb" JSON.stringifies the value before binding it as a query parameter
  // (node-postgres would otherwise mangle a JS array into a Postgres array
  // literal). An empty array / null collapses to SQL NULL. Used by the freeform
  // `specs` column (migration 019); the value must be an array of
  // { label, value } entries or the request is a 400 (VLT-65).
  // "integer" (INTEGER columns), "number" (NUMERIC columns) and "date" (DATE
  // columns) are checked before the query runs, so a value Postgres would
  // refuse is a 400 naming the field instead of a 500 (VLT-65). null and ""
  // still clear the column, as before.
  // Add other types here as needed.
  type?: "boolean" | "jsonb" | "integer" | "number" | "date";
}

// Module slug used by lib/insurance-valuation.ts MODULE_CATEGORIES and the
// admin route. Kept here to avoid a circular import (collection-handler.ts
// imports from this file).
export type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";

export interface CollectionConfig {
  label: string;             // for error messages and logs
  moduleSlug: ModuleSlug;    // matches lib/insurance-valuation.ts MODULE_CATEGORIES key (CUR-5)
  table: string;             // parent table, e.g. "guitar_items"
  alias: string;             // table alias used in SQL, e.g. "gi"
  imagesTable: string;       // child images table, e.g. "guitar_images"
  imageFkColumn: string;     // FK column on the images table, e.g. "guitar_item_id"
  valuationsTable: string;   // child valuations table
  valuationFkColumn: string; // FK column on the valuations table
  validCategories: readonly string[];
  fields: FieldSpec[];       // body fields for INSERT/UPDATE, in column order
  conditionRequired: boolean; // true: condition must be set + valid; false: validate only when provided
  patchSetUpdatedAt: boolean; // automobiles + iod set updated_at = NOW() in UPDATE; guitars/watches rely on a trigger
  forceDynamic: boolean;     // automobiles + iod export const dynamic = "force-dynamic"
  // Suggested spec keys for this module (CUR-1 specs / flip-sell groundwork).
  // The AI specs handler (lib/specs-handler.ts) targets these labels when
  // researching, and the SpecsEditor pre-seeds empty rows from them so manual
  // entry has a head start. Users can still add ad-hoc labels beyond this list,
  // and the AI may return relevant extras — the template is a hint, not a schema.
  specTemplate: readonly string[];
}
