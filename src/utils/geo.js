/**
 * Straight-line (Haversine) distance — used for house-call pricing.
 * Deliberately not a driving-distance API: no key, no cost, no new dependency.
 */
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in kilometers. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** A Google Maps link that opens directly on this point (no API key needed). */
function mapsLinkFor(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

module.exports = { haversineKm, mapsLinkFor };
