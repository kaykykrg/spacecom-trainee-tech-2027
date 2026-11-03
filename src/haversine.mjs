export const EARTH_RADIUS_METERS = 6_371_000;
const TO_RAD = Math.PI / 180;
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLon = (lon2 - lon1) * TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * TO_RAD) * Math.cos(lat2 * TO_RAD) * Math.sin(dLon / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, a));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}
export const isEncounterDistance = distance => Number.isFinite(distance) && distance >= 0 && distance < 20;
