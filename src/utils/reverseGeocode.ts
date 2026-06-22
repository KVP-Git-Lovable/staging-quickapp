/**
 * Reverse geocode (lat, lng) to a formatted address.
 * Tries Google Maps Geocoding first (using the existing browser key), then
 * falls back to OpenStreetMap Nominatim. Returns null if both fail.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // 1) Try Google Maps Geocoding
  try {
    const googleApiKey =
      (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
      (import.meta as any).env?.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    if (googleApiKey && googleApiKey !== 'your_google_maps_api_key_here') {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
        `&language=en&key=${googleApiKey}`;
      const res = await Promise.race([
        fetch(url),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Geocode timeout')), 10000)
        ),
      ]);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          const priority = ['premise', 'street_address', 'route', 'point_of_interest', 'establishment'];
          const score = (types: string[] = []) => {
            for (let i = 0; i < priority.length; i++) if (types.includes(priority[i])) return i;
            return 999;
          };
          const best = data.results
            .slice()
            .sort((a: any, b: any) => score(a.types) - score(b.types))[0];
          if (best?.formatted_address) return best.formatted_address as string;
        }
      }
    }
  } catch (e) {
    // fall through to OSM
  }

  // 2) Fallback: OpenStreetMap Nominatim
  try {
    const res = await Promise.race([
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'FieldSalesNavigator/1.0' } }
      ),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Geocode timeout')), 10000)
      ),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const parts: string[] = [];
    if (a.house_number) parts.push(a.house_number);
    if (a.road || a.street) parts.push(a.road || a.street);
    if (a.neighbourhood || a.suburb) parts.push(a.neighbourhood || a.suburb);
    if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
    if (a.state_district) parts.push(a.state_district);
    if (a.state) parts.push(a.state);
    if (a.postcode) parts.push(a.postcode);
    return parts.length ? parts.join(', ') : data.display_name || null;
  } catch {
    return null;
  }
}
