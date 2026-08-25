/**
 * Cached authentication integrity utilities.
 * Provides simple integrity checking for offline cached user data.
 */

const CACHE_SIGNATURE_KEY = 'cached_user_sig';

/**
 * Generate a simple hash signature for cached data integrity.
 * Uses a combination of user data + app-specific salt.
 */
const generateSignature = (userData: string): string => {
  // Simple hash using built-in btoa - not cryptographically secure but
  // provides basic integrity checking against casual tampering
  const salt = 'kvp-field-force-v1';
  const combined = `${salt}:${userData}:${salt}`;
  
  // Create a basic checksum
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return btoa(`${hash}:${userData.length}`);
};

/**
 * Store cached user with integrity signature.
 */
export const setCachedUser = (user: object): void => {
  const userData = JSON.stringify(user);
  const signature = generateSignature(userData);
  
  localStorage.setItem('cached_user', userData);
  localStorage.setItem(CACHE_SIGNATURE_KEY, signature);
};

/**
 * Retrieve and validate cached user data.
 * Returns null if data is missing, corrupted, or tampered.
 */
export const getValidatedCachedUser = (): object | null => {
  try {
    const userData = localStorage.getItem('cached_user');
    const storedSignature = localStorage.getItem(CACHE_SIGNATURE_KEY);
    
    if (!userData || !storedSignature) {
      return null;
    }
    
    // Verify integrity
    const expectedSignature = generateSignature(userData);
    if (storedSignature !== expectedSignature) {
      // Data tampered or corrupted - clear it
      clearCachedAuth();
      return null;
    }
    
    // Validate JSON structure
    const parsed = JSON.parse(userData);
    
    // Basic structure validation - must have id field
    if (!parsed || typeof parsed !== 'object' || !parsed.id) {
      clearCachedAuth();
      return null;
    }
    
    return parsed;
  } catch {
    // Any error means corrupted data
    clearCachedAuth();
    return null;
  }
};

/**
 * Clear all cached authentication data.
 */
export const clearCachedAuth = (): void => {
  // Clear user auth keys
  localStorage.removeItem('cached_user');
  localStorage.removeItem('cached_user_id');
  localStorage.removeItem('cached_role');
  localStorage.removeItem('cached_profile');
  localStorage.removeItem('cached_security_profile');
  localStorage.removeItem(CACHE_SIGNATURE_KEY);
  
  // Clear any permissions_ prefixed keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('permissions_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  // Clear feature flags cache
  localStorage.removeItem('feature_flags_cache');
};

/**
 * Save permissions for a user to localStorage.
 */
export const setCachedPermissions = (userId: string, permissions: object[]): void => {
  try {
    localStorage.setItem(`permissions_${userId}`, JSON.stringify(permissions));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
};

/**
 * Retrieve cached permissions for a user from localStorage.
 * Returns null if not found or invalid.
 */
export const getCachedPermissions = (userId: string): object[] | null => {
  try {
    const raw = localStorage.getItem(`permissions_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Clear cached permissions for a specific user.
 */
export const clearCachedPermissions = (userId: string): void => {
  localStorage.removeItem(`permissions_${userId}`);
};

/**
 * Clear ALL cached permissions (all users) from localStorage.
 * Useful when admin saves permission changes and we don't know which user is affected.
 */
export const clearAllCachedPermissions = (): void => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('permissions_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
};
