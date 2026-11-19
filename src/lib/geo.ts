export interface Point {
  lat: number;
  lng: number;
}

/** Where the map opens when we know nothing else: between Seattle and Tacoma. */
export const DEFAULT_CENTRE: Point = { lat: 47.4, lng: -122.3 };

/** Straight-line distance between two points, in miles. */
export function milesBetween(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export function milesText(miles: number): string {
  if (miles < 0.5) return 'Under a mile away';
  if (miles < 10) return `${miles.toFixed(1)} miles away`;
  return `${Math.round(miles)} miles away`;
}

/** Rounds a position to about one kilometre, so an exact address is never kept. */
export function roughly(p: Point): Point {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

export function pointOf(x: { lat?: number | string | null; lng?: number | string | null } | null | undefined): Point | null {
  if (!x || x.lat == null || x.lng == null) return null;
  const lat = Number(x.lat);
  const lng = Number(x.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Asks the phone or computer where it is. Rejects with a plain sentence. */
export function whereAmI(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot share its location. Tap the map instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location is turned off for this site. Allow it in your browser settings, or tap the map instead.'
              : 'We could not find your location. Tap the map instead.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** Looks up an address with OpenStreetMap. Returns null when nothing matches. */
export async function findAddress(text: string): Promise<Point | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('The address search is not answering. Tap the map to place the pin.');
  const rows = (await res.json()) as { lat: string; lon: string }[];
  if (rows.length === 0) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
}
