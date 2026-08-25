import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProfilePermissions } from '@/hooks/useProfilePermissions';
import { PermissionRedirect } from '@/components/security/PermissionRedirect';

interface RoutePermissionGuardProps {
  children: ReactNode;
  permissionPrefix: string;
  moduleName?: string;
}

/**
 * Route-level permission guard. Wraps a page and checks if the user
 * has `can_read` on at least one permission object matching the given prefix.
 * 
 * Bypass conditions (all content visible):
 *  - No security profile assigned (permissions array is empty AND no profile name)
 *  - Has can_read on any object starting with permissionPrefix
 * 
 * No special admin bypass - System Administrator has all permissions in DB.
 */
export const RoutePermissionGuard = ({ children, permissionPrefix, moduleName }: RoutePermissionGuardProps) => {
  const { permissions, isLoading, isFetching, isPlaceholderData, hasModuleAccess } = useProfilePermissions();

  const granted = hasModuleAccess(permissionPrefix);
  // Never deny on a cached/in-flight snapshot — a freshly granted module would
  // otherwise be blocked until the local permission cache expired.
  const usingStaleSnapshot = !granted && (isPlaceholderData || isFetching);

  // Still loading permissions
  if (isLoading || usingStaleSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // The loaded permission row is authoritative. Do not also depend on the
  // separately-fetched profile name: token refreshes can briefly clear that
  // display value even though the user's DB permission remains valid.
  if (granted) {
    return <>{children}</>;
  }

  // Profile missing/empty permissions, or no matching readable permission.
  if (permissions.length === 0) return <PermissionRedirect moduleName={moduleName} />;

  // No access → redirect with warning toast
  return <PermissionRedirect moduleName={moduleName} />;
};
