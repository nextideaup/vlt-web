// eBay account/inventory reads used to auto-fill listing settings, plus a shared
// "give me a valid access token" resolver (refreshes the ~2h token from the
// stored refresh token). Used by the account-options route and the listing
// handler so the refresh logic lives in one place.

import { query, queryOne } from "@/lib/db";
import { decryptToken, encryptToken } from "./crypto";
import { refreshAccessToken, ebaySandbox } from "./ebay-oauth";

function apiHost(): string {
  return ebaySandbox() ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export interface EbayTokenResult {
  token: string | null;
  error?: "not_connected" | "reauth";
}

// Returns a usable eBay access token for the user, refreshing (and persisting)
// it from the stored refresh token when it's expired. `error` distinguishes
// "no eBay connection" from "refresh failed — reconnect needed".
export async function resolveEbayAccessToken(userId: string): Promise<EbayTokenResult> {
  const cred = await queryOne<{
    token_encrypted: string;
    refresh_token_encrypted: string | null;
    token_expires_at: string | null;
  }>(
    `SELECT token_encrypted, refresh_token_encrypted, token_expires_at
       FROM marketplace_credentials WHERE user_id = $1 AND channel = 'ebay'`,
    [userId],
  );
  if (!cred) return { token: null, error: "not_connected" };

  let token: string;
  try {
    token = decryptToken(cred.token_encrypted);
  } catch {
    return { token: null, error: "reauth" };
  }

  if (cred.refresh_token_encrypted) {
    const expiresAt = cred.token_expires_at ? new Date(cred.token_expires_at).getTime() : 0;
    if (Date.now() > expiresAt - 60_000) {
      try {
        const refreshed = await refreshAccessToken(decryptToken(cred.refresh_token_encrypted));
        token = refreshed.access_token;
        await query(
          `UPDATE marketplace_credentials
              SET token_encrypted = $1, token_expires_at = $2, updated_at = NOW()
            WHERE user_id = $3 AND channel = 'ebay'`,
          [encryptToken(token), new Date(Date.now() + refreshed.expires_in * 1000), userId],
        );
      } catch {
        return { token: null, error: "reauth" };
      }
    }
  }
  return { token };
}

export interface EbayOption {
  id: string;
  name: string;
}
export interface EbayAccountOptions {
  locations: EbayOption[];
  fulfillmentPolicies: EbayOption[];
  paymentPolicies: EbayOption[];
  returnPolicies: EbayOption[];
  // True when a policy read returned 403 — the connection predates the
  // sell.account.readonly scope and the seller must reconnect.
  needsReauth: boolean;
}

// eBay returns these in its own order; sort by name (case-insensitive) so the
// dropdowns read alphabetically (STD-LST-001). Pre-selection is by id, so it's
// unaffected.
function byName(options: EbayOption[]): EbayOption[] {
  return [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function fetchPolicies(
  token: string,
  marketplaceId: string,
  kind: "fulfillment" | "payment" | "return",
): Promise<{ options: EbayOption[]; forbidden: boolean }> {
  const res = await fetch(
    `${apiHost()}/sell/account/v1/${kind}_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (res.status === 403) return { options: [], forbidden: true };
  if (!res.ok) return { options: [], forbidden: false };
  const data = (await res.json()) as Record<string, unknown>;
  const arr = (data[`${kind}Policies`] as Record<string, unknown>[] | undefined) ?? [];
  const idKey = `${kind}PolicyId`;
  const options = arr
    .map((p) => ({ id: String(p[idKey] ?? ""), name: String(p.name ?? p[idKey] ?? "") }))
    .filter((o) => o.id);
  return { options: byName(options), forbidden: false };
}

export interface NewLocationInput {
  name: string;
  addressLine1?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode: string;
  country: string; // 2-letter code, e.g. "US"
}

// Create a default inventory location. eBay has no self-serve UI for this — it
// only exists via the Inventory API — so this backs the in-app "Create
// location" form. Minimally needs country + postalCode; city/state/line1 are
// sent when provided. eBay returns 204 on success.
export async function createEbayLocation(token: string, key: string, input: NewLocationInput): Promise<void> {
  const address: Record<string, string> = { country: input.country, postalCode: input.postalCode };
  if (input.addressLine1) address.addressLine1 = input.addressLine1;
  if (input.city) address.city = input.city;
  if (input.stateOrProvince) address.stateOrProvince = input.stateOrProvince;

  const res = await fetch(`${apiHost()}/sell/inventory/v1/location/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
      Accept: "application/json",
    },
    body: JSON.stringify({
      location: { address },
      name: input.name,
      locationTypes: ["WAREHOUSE"],
      merchantLocationStatus: "ENABLED",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { errors?: { message?: string; longMessage?: string }[] };
      msg = j.errors?.[0]?.longMessage || j.errors?.[0]?.message || msg;
    } catch { /* non-JSON */ }
    throw new Error(`eBay location create failed (HTTP ${res.status}): ${msg}`);
  }
}

export async function fetchEbayAccountOptions(token: string, marketplaceId: string): Promise<EbayAccountOptions> {
  // Inventory locations (sell.inventory scope, always granted).
  let locations: EbayOption[] = [];
  try {
    const res = await fetch(`${apiHost()}/sell/inventory/v1/location?limit=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { locations?: { merchantLocationKey?: string; name?: string }[] };
      locations = byName(
        (data.locations ?? [])
          .map((l) => ({ id: String(l.merchantLocationKey ?? ""), name: String(l.name ?? l.merchantLocationKey ?? "") }))
          .filter((o) => o.id),
      );
    }
  } catch { /* leave empty */ }

  const [ful, pay, ret] = await Promise.all([
    fetchPolicies(token, marketplaceId, "fulfillment"),
    fetchPolicies(token, marketplaceId, "payment"),
    fetchPolicies(token, marketplaceId, "return"),
  ]);

  return {
    locations,
    fulfillmentPolicies: ful.options,
    paymentPolicies: pay.options,
    returnPolicies: ret.options,
    needsReauth: ful.forbidden || pay.forbidden || ret.forbidden,
  };
}
