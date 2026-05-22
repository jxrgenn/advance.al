/**
 * Location Fixture
 *
 * Seeds the test DB with the canonical Albanian location list so jobs.js /
 * users.js route validations (`Location.findOne({ city, isActive: true })`)
 * pass. Uses the same source of truth as the production seed.
 */

import Location from '../../src/models/Location.js';
import { locationSeedDocs } from '../../src/constants/albanianLocations.js';

export async function seedLocations() {
  await Location.insertMany(locationSeedDocs(), { ordered: false }).catch(() => {});
}

export default { seedLocations };
