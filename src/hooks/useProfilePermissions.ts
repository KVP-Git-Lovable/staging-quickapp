import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallback, useEffect } from 'react';
import { setCachedPermissions, getCachedPermissions } from '@/utils/cachedAuthIntegrity';
import { validatePermissions } from '@/utils/permissionValidator';

interface ProfilePermission {
  object_name: string;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

// Maps admin module feature names to their corresponding AdminControls card paths
export const ADMIN_MODULE_PERMISSION_MAP: Record<string, string> = {
  'admin_dashboard': '/admin',
  'admin_price_book': '/admin/price-books',
  'admin_attendance': '/attendance-management',
  'admin_product_mgmt': '/product-management',
  'admin_scheme_master': '/scheme-management',
  'admin_vendor_mgmt': '/vendors',
  'admin_territories_distributors': '/territories-and-distributors',
  'admin_expense_mgmt': '/admin-expense-management',
  'admin_feedback_mgmt': '/feedback-management',
  'admin_operations': '/operations',
  'admin_gps_track_mgmt': '/gps-track-management',
  'admin_retail_mgmt': '/retail-management',
  'admin_van_sales': '/van-sales-management',
  'admin_security_access': '/security-management',
  'admin_feature_mgmt': '/feature-management',
  'admin_gamification': '/gamification-admin',
  'admin_retailer_loyalty': '/retailer-loyalty-admin',
  'admin_company_profile': '/company-profile',
  'admin_invoice_mgmt': '/invoice-management',
  'admin_credit_mgmt': '/credit-management',
  
  'admin_recycle_bin': '/admin/recycle-bin',
  'admin_distributor_portal': '/admin/distributor-portal',
  'admin_target_vs_actual': '/admin/target-vs-actual',
  'admin_hierarchy_targets': '/admin/target-vs-actual', // same page
  'admin_user_mgmt': '/admin#users',
  'admin_system_settings': '/admin#settings',
  'admin_pincode_master': '/admin/pincode-master',
  'admin_tax_master': '/admin/tax-master',
  'admin_retailer_ext_db': '/admin/retailer-external-db',
  'admin_notification_rules': '/admin/notification-rules',
  'admin_activity_master': '/admin/activity-types',
  'admin_activity_coordinator': '/admin/activity-coordinator',
  'admin_db_health': '/admin/db-health',
};

// Sub-feature prefixes for modules where parent name doesn't match sub-feature naming
export const ADMIN_MODULE_SUB_PREFIXES: Record<string, string[]> = {
  'admin_product_mgmt': ['admin_product_'],
  'admin_scheme_master': ['admin_scheme_'],
  'admin_vendor_mgmt': ['admin_vendor_'],
  'admin_territories_distributors': ['admin_territory_', 'admin_distributor_', 'admin_region_'],
  'admin_expense_mgmt': ['admin_expense_'],
  'admin_feedback_mgmt': ['admin_feedback_', 'admin_competition_', 'admin_branding_'],
  'admin_gps_track_mgmt': ['admin_gps_'],
  'admin_retail_mgmt': ['admin_retailer_'],
  'admin_van_sales': ['admin_van_'],
  'admin_security_access': ['admin_security_', 'admin_profile_'],
  'admin_feature_mgmt': ['admin_feature_'],
  'admin_retailer_loyalty': ['admin_loyalty_'],
  'admin_company_profile': ['admin_company_', 'admin_bank_', 'admin_header_'],
  'admin_invoice_mgmt': ['admin_invoice_'],
  'admin_credit_mgmt': ['admin_credit_'],
  
  'admin_notification_rules': ['admin_notification_rules_'],
  'admin_distributor_portal': ['admin_portal_'],
  'admin_target_vs_actual': ['admin_target_'],
  'admin_hierarchy_targets': ['admin_hierarchy_'],
  'admin_user_mgmt': ['admin_user_'],
  'admin_pincode_master': ['admin_pincode_'],
  'admin_tax_master': ['tax_master_'],
  'admin_retailer_ext_db': ['admin_retailer_ext_'],
  'admin_system_settings': ['admin_system_', 'admin_settings_'],
  'admin_activity_master': ['activity_type_'],
  'admin_activity_coordinator': ['activity_team_'],
};

// Reverse map: path -> feature name(s)
export const PATH_TO_PERMISSION_MAP: Record<string, string> = {};
Object.entries(ADMIN_MODULE_PERMISSION_MAP).forEach(([feature, path]) => {
  if (!PATH_TO_PERMISSION_MAP[path]) {
    PATH_TO_PERMISSION_MAP[path] = feature;
  }
});

export const useProfilePermissions = () => {
  const { user } = useAuth();

  const { data: permissions = [], isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['profile-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const cached = getCachedPermissions(user.id) as ProfilePermission[] | null;

      // Offline → use cached permissions; don't attempt a fetch that will fail and wipe them.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return cached ?? [];

      try {
        const { data: profilePerms, error: profileError } = await supabase
          .from('user_profiles')
          .select('profile_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('[Permissions] user_profiles failed, using cache:', profileError);
          return cached ?? [];
        }
        if (!profilePerms?.profile_id) {
          console.warn('[Permissions] no profile_id, using cache');
          return cached ?? [];
        }

        // PostgREST caps a single select at 1000 rows. Admin profiles exceed that,
        // which silently dropped recently-added grants (e.g. module_quickapp_ai).
        // Page through the full set explicitly.
        const PAGE = 1000;
        const all: ProfilePermission[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: page, error: permsError } = await supabase
            .from('profile_object_permissions')
            .select('object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all')
            .eq('profile_id', profilePerms.profile_id)
            .order('object_name', { ascending: true })
            .range(from, from + PAGE - 1);

          if (permsError) {
            console.error('[Permissions] perms failed, using cache:', permsError);
            return cached ?? [];
          }

          const rows = (page || []) as ProfilePermission[];
          all.push(...rows);
          if (rows.length < PAGE) break;
        }

        const result = all;


        console.info('[Permissions] Loaded', result.length, 'permissions for profile', profilePerms.profile_id);

        // Only overwrite the cache when we actually got permissions — never cache an empty result.
        if (result.length > 0) {
          setCachedPermissions(user.id, result);
          return result;
        }
        return cached ?? result;
      } catch (e) {
        console.error('[Permissions] fetch threw, using cache:', e);
        return cached ?? [];
      }
    },

    enabled: !!user?.id,
    // ✅ Load from localStorage instantly — no blank nav on startup
    placeholderData: () => {
      if (!user?.id) return undefined;
      const cached = getCachedPermissions(user.id);
      return cached ? (cached as ProfilePermission[]) : undefined;
    },
    staleTime: 2 * 60 * 1000,     // 2 min — permission grants must land quickly
    gcTime: 60 * 60 * 1000,       // keep in memory for 1 hour
    refetchOnWindowFocus: false,   // don't re-fetch on tab switch
    // Always revalidate on mount: cached (placeholder) permissions can predate a
    // newly granted module and would otherwise deny access until the cache expires.
    refetchOnMount: 'always',
  });

  // Dev-mode: validate that all UI permission keys exist in DB
  useEffect(() => {
    if (permissions.length > 0) {
      validatePermissions(permissions);
    }
  }, [permissions]);

  const hasAnyAdminPermission = permissions.some(
    p => p.object_name.startsWith('admin_') && p.can_read
  );

  const hasPermission = useCallback((objectName: string, permType: 'can_read' | 'can_create' | 'can_edit' | 'can_delete' | 'can_view_all' | 'can_modify_all' = 'can_read') => {
    const perm = permissions.find(p => p.object_name === objectName);
    return perm ? !!perm[permType] : false;
  }, [permissions]);

  // Check if user has can_read on any sub-feature under a given feature group prefix
  const hasModuleAccess = useCallback((featurePrefix: string) => {
    return permissions.some(
      p => p.object_name.startsWith(featurePrefix) && p.can_read
    );
  }, [permissions]);

  // Get list of admin module feature names user has access to
  const permittedAdminModules = Object.keys(ADMIN_MODULE_PERMISSION_MAP).filter(
    featureName => {
      if (hasModuleAccess(featureName)) return true;
      const subPrefixes = ADMIN_MODULE_SUB_PREFIXES[featureName];
      if (subPrefixes) {
        return subPrefixes.some(prefix =>
          permissions.some(p => p.object_name.startsWith(prefix) && p.can_read)
        );
      }
      return false;
    }
  );

  // Get permitted admin paths
  const permittedAdminPaths = new Set(
    permittedAdminModules.map(f => ADMIN_MODULE_PERMISSION_MAP[f])
  );

  // Check field-level permission (permission_type = 'field')
  const hasFieldPermission = useCallback(
    (fieldName: string, permType: 'can_read' | 'can_create' | 'can_edit' | 'can_delete' = 'can_read') => {
      const perm = permissions.find(p => p.object_name === fieldName);
      return perm ? !!perm[permType] : false;
    },
    [permissions]
  );

  // Check action-level permission (permission_type = 'action')
  const hasActionPermission = useCallback(
    (actionName: string, permType: 'can_read' | 'can_create' | 'can_edit' | 'can_delete' = 'can_read') => {
      const perm = permissions.find(p => p.object_name === actionName);
      return perm ? !!perm[permType] : false;
    },
    [permissions]
  );

  // Check widget-level permission (permission_type = 'widget')
  const hasWidgetPermission = useCallback(
    (widgetName: string, permType: 'can_read' | 'can_create' | 'can_edit' | 'can_delete' = 'can_read') => {
      const perm = permissions.find(p => p.object_name === widgetName);
      return perm ? !!perm[permType] : false;
    },
    [permissions]
  );

  return {
    permissions,
    isLoading,
    isFetching,
    refetch,
    isPlaceholderData, // useful for debugging: true = showing cached data
    hasAnyAdminPermission,
    hasPermission,
    hasModuleAccess,
    hasFieldPermission,
    hasActionPermission,
    hasWidgetPermission,
    permittedAdminModules,
    permittedAdminPaths,
  };
};
