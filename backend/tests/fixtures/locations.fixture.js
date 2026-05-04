/**
 * Location Fixture
 *
 * Seeds the test DB with Albanian cities so jobs.js / users.js / etc.
 * route validations (`Location.findOne({ city, isActive: true })`) pass.
 */

import Location from '../../src/models/Location.js';

const ALBANIAN_CITIES = [
  'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan',
  'Korçë', 'Fier', 'Berat', 'Gjirokastër', 'Lushnjë',
  'Pogradec', 'Kavajë', 'Lezhë', 'Kukës', 'Sarandë'
];

export async function seedLocations() {
  const docs = ALBANIAN_CITIES.map((city, i) => ({
    city,
    region: city,
    country: 'Albania',
    isActive: true,
    displayOrder: i
  }));
  await Location.insertMany(docs, { ordered: false }).catch(() => {});
}

export default { seedLocations };
