/**
 * The Wi-Fi networks, and the one place their names are written down.
 *
 * Every SSID here was read back OUT OF A QR CODE THAT CONNECTS, not off a
 * printed label. That distinction cost a lot of time: the label in the
 * original guide reads "Merlin 5GHZ" because HTML collapses runs of spaces
 * when it renders, while the network is really "Merlin  5GHZ" with two. Wi-Fi
 * names are case and space sensitive, so a guide can look right and still be
 * impossible to connect to.
 *
 * build.mjs prints from this table and gen-qr.mjs encodes from it, so the
 * printed name and the scanned name cannot drift apart.
 *
 * No dependencies here on purpose: build.mjs must run without npm install.
 */

export const NETWORKS = [
  {
    slug: 'merlin-5ghz',
    ssid: 'Merlin  5GHZ',          // two spaces before the band
    pass: '101090ora20',
    security: 'WPA',
    hidden: false,
    label: 'Network — fast',
    note: 'two spaces before 5GHZ',
  },
  {
    slug: 'merlin-24ghz',
    ssid: 'Merlin  2.4GHZ',        // two spaces before the band
    pass: '101090ora20',
    security: 'WPA',
    hidden: false,
    label: 'Network — wide range',
    note: 'two spaces before 2.4GHZ',
  },
  {
    slug: 'digicom',
    ssid: 'Digicom.AL - 1  ',      // two TRAILING spaces
    pass: 'merlin1990',
    security: 'WPA',
    hidden: false,
    label: 'Network',
    // No printed note: the QR carries the trailing spaces, and the owner did
    // not want them called out on the page.
    note: '',
  },
];

export const bySlug = (slug) => {
  const net = NETWORKS.find((n) => n.slug === slug);
  if (!net) throw new Error(`unknown network: ${slug}`);
  return net;
};

// WIFI: URI scheme. Backslash, semicolon, comma, colon and double quote are
// escaped with a backslash; backslash has to go first or the rest double-escape.
const esc = (s) => s.replace(/([\;,:"])/g, '\\$1');

// Field order is T, S, P, byte for byte the form used by the QR codes in the
// original guide, which are known to work on the owner's phone. Do not reorder.
export const payloadFor = ({ ssid, pass, security = 'WPA', hidden = false }) =>
  security === 'nopass'
    ? `WIFI:T:nopass;S:${esc(ssid)};${hidden ? 'H:true;' : ''};`
    : `WIFI:T:${security};S:${esc(ssid)};P:${esc(pass)};${hidden ? 'H:true;' : ''};`;

// Payloads confirmed to connect: the first two decoded out of the original
// guide's PDF, the third confirmed by the owner scanning it. verify-qr.mjs
// asserts the generated payloads still match these exactly.
export const KNOWN_GOOD = {
  'merlin-5ghz':  'WIFI:T:WPA;S:Merlin  5GHZ;P:101090ora20;;',
  'merlin-24ghz': 'WIFI:T:WPA;S:Merlin  2.4GHZ;P:101090ora20;;',
  'digicom':      'WIFI:T:WPA;S:Digicom.AL - 1  ;P:merlin1990;;',
};
