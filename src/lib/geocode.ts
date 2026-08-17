const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

interface NominatimResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Reverse geocode a lat/lng using Nominatim (OpenStreetMap).
 * Returns a city/region string or null if unavailable.
 * Respects Nominatim's usage policy: max 1 req/sec, includes User-Agent.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      addressdetails: '1',
      zoom: '14',
    });

    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': 'PinDrop/1.0 (tourist-map-tool)',
      },
    });

    if (!res.ok) return null;

    const data: NominatimResponse = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const city = addr.city || addr.town || addr.village || addr.municipality;
    const region = addr.county || addr.state;

    if (city && region) return `${city} (${region})`;
    if (city) return city;
    if (region) return region;
    if (addr.country) return addr.country;
    return null;
  } catch {
    return null;
  }
}

/**
 * Delay helper to enforce Nominatim's 1 req/sec rate limit.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
