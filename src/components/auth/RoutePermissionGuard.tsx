import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProfilePermissions } from '@/hooks/useProfilePermissions';
import { useAuth } from '@/hooks/useAuth';
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
  const { securityProfileName, loading: authLoading } = useAuth();

  const granted = hasModuleAccess(permissionPrefix);
  // Never deny on a cached/in-flight snapshot — a freshly granted module would
  // otherwise be blocked until the local permission cache expired.
  const usingStaleSnapshot = !granted && (isPlaceholderData || isFetching);

  // Still loading permissions
  if (isLoading || authLoading || usingStaleSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // No security profile assigned → deny by default (DB-driven only)
  if (!securityProfileName) return <PermissionRedirect moduleName={moduleName} />;

  // Profile assigned but zero permissions → deny all
  if (permissions.length === 0) return <PermissionRedirect moduleName={moduleName} />;

  // Check if user has can_read on any object matching the prefix
  if (granted) {
    return <>{children}</>;
  }

  // No access → redirect with warning toast
  return <PermissionRedirect moduleName={moduleName} />;
};
