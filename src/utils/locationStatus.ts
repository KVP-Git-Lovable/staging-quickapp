import { Capacitor } from '@capacitor/core';

export type LocationStatus = 'ready' | 'prompt' | 'denied' | 'unavailable' | 'unknown';

export interface LocationCheckResult {
  status: LocationStatus;
  message: string | null;
}

/**
 * Pre-check whether geolocation is available before attempting capture.
 * Returns a status + user-facing message (null when ready/prompt).
 *
 * Does NOT trigger an OS permission prompt — that should only happen on an
 * explicit user gesture. See `requestLocationPermission` for that.
 */
export async function checkLocationAvailability(): Promise<LocationCheckResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.checkPermissions();
        const state = perm.location || perm.coarseLocation;
        if (state === 'granted') return { status: 'ready', message: null };
        if (state === 'prompt' || state === 'prompt-with-rationale') {
          return { status: 'prompt', message: null };
        }
        return {
          status: 'denied',
          message: 'Location permission is off for the app — please enable it and try again.',
        };
      } catch {
        return { status: 'unknown', message: null };
      }
    }

    if (typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
      try {
        const res = await (navigator as any).permissions.query({ name: 'geolocation' as PermissionName });
        if (res.state === 'denied') {
          return {
            status: 'denied',
            message: 'Location permission is off for the app — please enable it and try again.',
          };
        }
        if (res.state === 'prompt') {
          return { status: 'prompt', message: null };
        }
        return { status: 'ready', message: null };
      } catch {
        // fall through
      }
    }

    if (typeof navigator !== 'undefined' && !navigator.geolocation) {
      return {
        status: 'unavailable',
        message: "Location on your phone isn't enabled. Please turn on location/GPS before capturing.",
      };
    }

    return { status: 'unknown', message: null };
  } catch {
    return { status: 'unknown', message: null };
  }
}

/**
 * Request location permission. Safe to call on web (it's a no-op there since
 * the browser asks implicitly on first `getCurrentPosition`). On native, this
 * triggers the OS prompt when the current state is 'prompt'.
 *
 * MUST be called only from a user gesture handler (e.g. button click).
 */
export async function requestLocationPermission(): Promise<LocationCheckResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.requestPermissions();
      const state = perm.location || perm.coarseLocation;
      if (state === 'granted') return { status: 'ready', message: null };
      return {
        status: 'denied',
        message: 'Location permission is off for the app — please enable it in Settings and try again.',
      };
    }
    return { status: 'ready', message: null };
  } catch {
    return { status: 'unknown', message: null };
  }
}

/**
 * Convert a GeolocationPositionError (or similar) into a user-facing message.
 */
export function classifyLocationError(err: any): { status: LocationStatus; message: string } {
  const code =
    typeof err?.code === 'number'
      ? err.code
      : typeof err?.errorCode === 'number'
      ? err.errorCode
      : null;

  if (code === 1 || /denied|permission/i.test(String(err?.message || ''))) {
    return {
      status: 'denied',
      message: 'Location permission is off for the app — please enable it and try again.',
    };
  }
  if (code === 2 || /unavailable|disabled/i.test(String(err?.message || ''))) {
    return {
      status: 'unavailable',
      message:
        "Location on your phone isn't enabled. Please turn on location/GPS before capturing.",
    };
  }
  if (code === 3 || /timeout/i.test(String(err?.message || ''))) {
    return {
      status: 'unknown',
      message: "Couldn't get a GPS fix — please try again in an open area.",
    };
  }
  return {
    status: 'unknown',
    message: err?.message || 'Could not get your current location. Please enable GPS and try again.',
  };
}
