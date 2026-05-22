/**
 * Canonical list of Albanian locations for the job board.
 *
 * Single source of truth — used by the Location seed (seed-locations.js),
 * the destructive dev seed (seed-database.js) and the test fixture. The
 * frontend never hardcodes cities; it loads them from GET /api/locations.
 *
 * Coverage: every county capital + all notable municipalities/towns across
 * Albania's 12 counties, plus a remote option and a diaspora option.
 * `city` uses the name people actually search by (the city seat, not the
 * post-2015 municipality name — e.g. Peshkopi, not Dibër).
 */

export const ALBANIAN_LOCATIONS = [
  // Major cities first (these drive displayOrder).
  { city: 'Tiranë', region: 'Tiranë' },
  { city: 'Durrës', region: 'Durrës' },
  { city: 'Vlorë', region: 'Vlorë' },
  { city: 'Elbasan', region: 'Elbasan' },
  { city: 'Shkodër', region: 'Shkodër' },
  { city: 'Fier', region: 'Fier' },
  { city: 'Korçë', region: 'Korçë' },
  { city: 'Berat', region: 'Berat' },
  { city: 'Lushnjë', region: 'Fier' },
  { city: 'Gjirokastër', region: 'Gjirokastër' },
  { city: 'Sarandë', region: 'Vlorë' },
  { city: 'Pogradec', region: 'Korçë' },
  { city: 'Kavajë', region: 'Tiranë' },
  { city: 'Lezhë', region: 'Lezhë' },
  { city: 'Kukës', region: 'Kukës' },
  { city: 'Kamëz', region: 'Tiranë' },
  { city: 'Peshkopi', region: 'Dibër' },

  // Tiranë county
  { city: 'Vorë', region: 'Tiranë' },
  { city: 'Rrogozhinë', region: 'Tiranë' },
  // Durrës county
  { city: 'Krujë', region: 'Durrës' },
  { city: 'Fushë-Krujë', region: 'Durrës' },
  { city: 'Shijak', region: 'Durrës' },
  // Shkodër county
  { city: 'Koplik', region: 'Shkodër' },
  { city: 'Pukë', region: 'Shkodër' },
  { city: 'Vau i Dejës', region: 'Shkodër' },
  { city: 'Fushë-Arrëz', region: 'Shkodër' },
  // Lezhë county
  { city: 'Laç', region: 'Lezhë' },
  { city: 'Mamurras', region: 'Lezhë' },
  { city: 'Rrëshen', region: 'Lezhë' },
  // Dibër county
  { city: 'Burrel', region: 'Dibër' },
  { city: 'Bulqizë', region: 'Dibër' },
  { city: 'Klos', region: 'Dibër' },
  // Kukës county
  { city: 'Krumë', region: 'Kukës' },
  { city: 'Bajram Curri', region: 'Kukës' },
  // Elbasan county
  { city: 'Cërrik', region: 'Elbasan' },
  { city: 'Gramsh', region: 'Elbasan' },
  { city: 'Librazhd', region: 'Elbasan' },
  { city: 'Peqin', region: 'Elbasan' },
  { city: 'Belsh', region: 'Elbasan' },
  { city: 'Prrenjas', region: 'Elbasan' },
  // Fier county
  { city: 'Patos', region: 'Fier' },
  { city: 'Ballsh', region: 'Fier' },
  { city: 'Roskovec', region: 'Fier' },
  { city: 'Divjakë', region: 'Fier' },
  // Berat county
  { city: 'Kuçovë', region: 'Berat' },
  { city: 'Ura Vajgurore', region: 'Berat' },
  { city: 'Poliçan', region: 'Berat' },
  { city: 'Çorovodë', region: 'Berat' },
  // Korçë county
  { city: 'Maliq', region: 'Korçë' },
  { city: 'Bilisht', region: 'Korçë' },
  { city: 'Ersekë', region: 'Korçë' },
  // Vlorë county
  { city: 'Himarë', region: 'Vlorë' },
  { city: 'Orikum', region: 'Vlorë' },
  { city: 'Selenicë', region: 'Vlorë' },
  { city: 'Delvinë', region: 'Vlorë' },
  { city: 'Konispol', region: 'Vlorë' },
  // Gjirokastër county
  { city: 'Përmet', region: 'Gjirokastër' },
  { city: 'Tepelenë', region: 'Gjirokastër' },
  { city: 'Memaliaj', region: 'Gjirokastër' },
  { city: 'Këlcyrë', region: 'Gjirokastër' },
  { city: 'Libohovë', region: 'Gjirokastër' },

  // Non-geographic options
  { city: 'Online/Remote', region: 'Remote' },
  { city: 'Jashtë Shqipërisë', region: 'Diaspora' },
];

/** Location documents ready for insert/upsert (adds country + ordering). */
export function locationSeedDocs() {
  return ALBANIAN_LOCATIONS.map((loc, i) => ({
    city: loc.city,
    region: loc.region,
    country: 'Albania',
    isActive: true,
    displayOrder: i,
  }));
}
