import { useEffect, useState } from "react";
import { configApi } from "@/lib/api";

/**
 * Listing prices shown on marketing / onboarding pages.
 *
 * The server is the source of truth: GET /api/configuration/public serves
 * `pricing_standard_posting` / `pricing_promoted_posting` — exactly what
 * checkout charges (backend lib/pricing.js, admin-editable). These defaults
 * mirror backend FALLBACK_LISTING_PRICES and are only shown until (or if
 * ever) that request fails.
 */
export const DEFAULT_LISTING_PRICES = Object.freeze({ standard: 35, promoted: 49 });

/** Every paid listing (new or renewed) stays live for this many days. */
export const LISTING_DURATION_DAYS = 21;

export type ListingPrices = { standard: number; promoted: number };

const readPrice = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Prices from the public-config `settings` map, or null when absent/invalid. */
export const listingPricesFromSettings = (settings: Record<string, unknown> | undefined | null): ListingPrices | null => {
  const standard = readPrice(settings?.pricing_standard_posting);
  const promoted = readPrice(settings?.pricing_promoted_posting);
  return standard !== null && promoted !== null ? { standard, promoted } : null;
};

/** "35 €" / "35,50 €" — the Albanian way of writing euro amounts. */
export const formatEuro = (amount: number): string =>
  Number.isInteger(amount) ? `${amount} €` : `${amount.toFixed(2).replace(".", ",")} €`;

// One request per page load, shared by every component that asks.
let pricesPromise: Promise<ListingPrices> | null = null;
const fetchListingPrices = (): Promise<ListingPrices> => {
  if (!pricesPromise) {
    pricesPromise = configApi.getPublic()
      .then(res => (res.success && listingPricesFromSettings(res.data?.settings)) || { ...DEFAULT_LISTING_PRICES })
      .catch(() => {
        pricesPromise = null; // allow a retry on the next mount
        return { ...DEFAULT_LISTING_PRICES };
      });
  }
  return pricesPromise;
};

/**
 * Current list prices from the server; null while loading (render a
 * placeholder — never flash a default that may differ from what checkout
 * charges). Falls back to DEFAULT_LISTING_PRICES only if the request fails.
 */
export const useListingPrices = (): ListingPrices | null => {
  const [prices, setPrices] = useState<ListingPrices | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchListingPrices().then(p => { if (!cancelled) setPrices(p); });
    return () => { cancelled = true; };
  }, []);
  return prices;
};
