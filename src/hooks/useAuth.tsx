import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { setCachedUser, clearCachedAuth, clearCachedPermissions } from '@/utils/cachedAuthIntegrity';
import { devLog, devError } from '@/utils/devLog';
import { monitoring } from '@/services/MonitoringService';
import { Preferences } from '@capacitor/preferences';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { clearRetailerIndex } from '@/lib/retailerIndex';
import { requestLocationPermission, requestStoragePermission } from '@/utils/permissions';
import i18n from '@/i18n/config';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: 'admin' | 'user' | null;
  userProfile: UserProfile | null;
  securityProfileName: string | null;
  loading: boolean;
  mustChangePassword: boolean;
  onPasswordChanged: () => void;
  dismissPasswordChange: () => void;
  signUp: (data: SignUpData) => Promise<void>;
  signIn: (email: string, password: string, role?: 'admin' | 'user') => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordByEmail: (email: string) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
}

interface SignUpData {
  email: string;
  password: string;
  username: string;
  fullName: string;
  phoneNumber?: string;
  recoveryEmail?: string;
  hintQuestion: string;
  hintAnswer: string;
}

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  phone_number?: string;
  recovery_email?: string;
  profile_picture_url?: string;
  designation?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [securityProfileName, setSecurityProfileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  /**
   * SECURITY: Purge per-user IndexedDB stores when the authenticated user changes.
   * Without this, beats/beat_plans/retailers/visits cached from the previous user
   * leak into the new user's My Visits screen (e.g. wrong beat shown in header).
   * Only runs when the new user id differs from the previously-seen one.
   */
  const purgeStaleUserDataIfIdentityChanged = async (newUserId: string) => {
    try {
      const prev = localStorage.getItem('cached_user_id');
      if (prev && prev !== newUserId) {
        devLog('[Auth] User identity changed', prev, '→', newUserId, '— purging stale per-user caches');
        const hasUnsynced = await offlineStorage.hasUnsyncedItems().catch(() => false);
        const stores: string[] = [
          STORES.BEATS,
          STORES.BEAT_PLANS,
          STORES.RETAILERS,
          STORES.VISITS,
          STORES.SYNC_METADATA,
        ];
        if (!hasUnsynced) stores.push(STORES.ORDERS);
        await Promise.all(stores.map((s) => offlineStorage.clear(s).catch(() => undefined)));
        // Also clear ephemeral visit-status & snapshot caches keyed to the previous user
        try {
          localStorage.removeItem('visit_status_cache');
          Object.keys(localStorage)
            .filter((k) => k.startsWith('myvisits_snapshot_'))
            .forEach((k) => localStorage.removeItem(k));
        } catch {}
        try {
          await Preferences.remove({ key: `myvisits_snapshot_${prev}` });
        } catch {}
        clearRetailerIndex();
      }
    } catch (e) {
      devError('[Auth] Error purging stale user data on identity change:', e);
    }
  };


  const onPasswordChanged = () => {
    setMustChangePassword(false);
  };

  const dismissPasswordChange = () => {
    setMustChangePassword(false);
  };

  /**
   * @deprecated Do NOT use userRole for access control decisions.
   * Use useProfilePermissions() hook instead, which reads from profile_object_permissions (DB-driven).
   * userRole is kept only for non-security display purposes (e.g., UserHierarchy, designation display).
   */
  const fetchUserRole = async (userId: string): Promise<'admin' | 'user' | null> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        devError('Error fetching user role:', error);
        return null;
      }

      return data?.role || null;
    } catch (error) {
      devError('Error in fetchUserRole:', error);
      return null;
    }
  };

  const fetchSecurityProfileName = async (userId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_id, security_profiles(name)')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        devError('Error fetching security profile:', error);
        return null;
      }

      // Extract the profile name from the nested response
      const profileName = (data?.security_profiles as any)?.name || null;
      return profileName;
    } catch (error) {
      devError('Error in fetchSecurityProfileName:', error);
      return null;
    }
  };

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      // Use a simple query without any complex operations
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, phone_number, recovery_email, profile_picture_url, preferred_language, designation')
        .eq('id', userId)
        .single();

      if (error) {
        // If profile doesn't exist, return a basic profile with user data
        if (error.code === 'PGRST116') {
          return {
            id: userId,
            username: user?.email?.split('@')[0] || 'User',
            full_name: user?.user_metadata?.full_name || 'Unknown User',
            phone_number: user?.user_metadata?.phone_number,
            recovery_email: user?.user_metadata?.recovery_email,
            profile_picture_url: user?.user_metadata?.profile_picture_url
          };
        }
        devError('Error fetching user profile:', error);
        return null;
      }

      // Sync language preference from profile
      if (data?.preferred_language && data.preferred_language !== i18n.language) {
        await i18n.changeLanguage(data.preferred_language);
        localStorage.setItem('preferredLanguage', data.preferred_language);
        devLog('Language synced from profile:', data.preferred_language);
      }

      return data;
    } catch (error) {
      devError('Error in fetchUserProfile:', error);
      // Return basic profile from user metadata as fallback
      if (user) {
        return {
          id: userId,
          username: user?.email?.split('@')[0] || 'User',
          full_name: user?.user_metadata?.full_name || 'Unknown User',
          phone_number: user?.user_metadata?.phone_number,
          recovery_email: user?.user_metadata?.recovery_email,
          profile_picture_url: user?.user_metadata?.profile_picture_url
        };
      }
      return null;
    }
  };

  useEffect(() => {
    // Load cached auth state for offline support
    const loadCachedAuth = () => {
      try {
        const cachedUser = localStorage.getItem('cached_user');
        const cachedRole = localStorage.getItem('cached_role');
        const cachedProfile = localStorage.getItem('cached_profile');
        const cachedSecurityProfile = localStorage.getItem('cached_security_profile');
        
        if (cachedUser) {
          setUser(JSON.parse(cachedUser));
          setUserRole(cachedRole as 'admin' | 'user' | null);
          setUserProfile(cachedProfile ? JSON.parse(cachedProfile) : null);
          setSecurityProfileName(cachedSecurityProfile || null);
        }
      } catch (error) {
        devError('Error loading cached auth:', error);
      }
    };

    // Load cached auth immediately for offline support
    loadCachedAuth();
    
    // Safety timeout: ensure loading is false after 5 seconds max
    const loadingTimeout = setTimeout(() => {
      devLog('Auth loading timeout reached, setting loading to false');
      setLoading(false);
    }, 5000);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        devLog('Auth state change:', event);
        
        // Only clear auth on explicit sign out — never on token refresh failures
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setUserRole(null);
          setUserProfile(null);
          setSecurityProfileName(null);
          clearCachedAuth();
          clearTimeout(loadingTimeout);
          setLoading(false);
          return;
        }
        
        // For all other events, update state normally
        setSession(session);
        const currentUser = session?.user ?? null;
        
        if (currentUser) {
          await purgeStaleUserDataIfIdentityChanged(currentUser.id);
          setUser(currentUser);
          setCachedUser(currentUser);
          localStorage.setItem('cached_user_id', currentUser.id);
          
          // Defer Supabase calls with setTimeout
          setTimeout(async () => {
            try {
              const role = await fetchUserRole(currentUser.id);
              setUserRole(role);
              if (role) localStorage.setItem('cached_role', role);
              
              const profile = await fetchUserProfile(currentUser.id);
              setUserProfile(profile);
              if (profile) localStorage.setItem('cached_profile', JSON.stringify(profile));
              
              const secProfile = await fetchSecurityProfileName(currentUser.id);
              setSecurityProfileName(secProfile);
              if (secProfile) localStorage.setItem('cached_security_profile', secProfile);
            } catch (err) {
              devError('Error loading user data in auth change:', err);
              const basicProfile: UserProfile = {
                id: currentUser.id,
                username: currentUser.email?.split('@')[0] || 'User',
                full_name: currentUser.user_metadata?.full_name || 'Unknown User'
              };
              setUserProfile(basicProfile);
              localStorage.setItem('cached_profile', JSON.stringify(basicProfile));
            }
          }, 0);
        } else if (!navigator.onLine) {
          // Offline and no session — preserve cached state, don't log out
          devLog('No session but offline — preserving cached auth state');
        } else {
          // Online but no user and not SIGNED_OUT — could be token refresh issue
          // Preserve cached state to prevent unexpected logouts
          devLog('No session user but not explicit sign-out — preserving cached state');
        }
        
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (session?.user) {
        setCachedUser(session.user);
        localStorage.setItem('cached_user_id', session.user.id);
        
        try {
          const role = await fetchUserRole(session.user.id);
          setUserRole(role);
          if (role) localStorage.setItem('cached_role', role);
          
          const profile = await fetchUserProfile(session.user.id);
          setUserProfile(profile);
          if (profile) localStorage.setItem('cached_profile', JSON.stringify(profile));
          
          const secProfile = await fetchSecurityProfileName(session.user.id);
          setSecurityProfileName(secProfile);
          if (secProfile) localStorage.setItem('cached_security_profile', secProfile);
          
          // Check if user must change password
          const { data: profileData } = await supabase
            .from('profiles')
            .select('must_change_password')
            .eq('id', session.user.id)
            .maybeSingle();
          
          if (profileData?.must_change_password) {
            setMustChangePassword(true);
          }
        } catch (err) {
          devError('Error loading user data:', err);
          // Set basic profile from user metadata
          const basicProfile: UserProfile = {
            id: session.user.id,
            username: session.user.email?.split('@')[0] || 'User',
            full_name: session.user.user_metadata?.full_name || 'Unknown User'
          };
          setUserProfile(basicProfile);
          localStorage.setItem('cached_profile', JSON.stringify(basicProfile));
        }
      }
      
      clearTimeout(loadingTimeout);
      setLoading(false);
    }).catch((error) => {
      devError('Error getting session:', error);
      // On network failure, fall back to cached auth state
      const cachedUser = localStorage.getItem('cached_user');
      if (cachedUser) {
        try {
          const parsed = JSON.parse(cachedUser);
          setUser(parsed);
          setUserRole(localStorage.getItem('cached_role') as 'admin' | 'user' | null);
          const cachedProfile = localStorage.getItem('cached_profile');
          setUserProfile(cachedProfile ? JSON.parse(cachedProfile) : null);
          setSecurityProfileName(localStorage.getItem('cached_security_profile') || null);
          devLog('Session fetch failed — restored from cached auth state');
        } catch (parseErr) {
          devError('Error parsing cached auth on fallback:', parseErr);
        }
      }
      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (data: SignUpData) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          username: data.username,
          full_name: data.fullName,
          phone_number: data.phoneNumber,
          recovery_email: data.recoveryEmail,
          hint_question: data.hintQuestion,
          hint_answer: data.hintAnswer,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      throw error;
    }

    toast.success('Account created successfully! Please check your email to verify your account.');
  };

  const signIn = async (email: string, password: string, role?: 'admin' | 'user') => {
    await monitoring.trace('user_login_process', async () => {
      let data, error: AuthError | null;
      
      const MAX_RETRIES = 2;
      const RETRY_DELAYS = [2000, 4000];
      const TIMEOUT_MS = 15000;
      
      const attemptSignIn = async (): Promise<{ data: any; error: AuthError | null }> => {
        return Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Login request timed out. Please try again.')), TIMEOUT_MS)
          ),
        ]);
      };
      
      const isNetworkError = (msg: string) =>
        msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
        msg.includes('fetch failed') || msg.includes('Load failed') ||
        msg.includes('timed out');
      
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await attemptSignIn();
          data = result.data;
          error = result.error;
          break; // Success, exit retry loop
        } catch (networkError: any) {
          const msg = networkError?.message || '';
          if (isNetworkError(msg)) {
            if (attempt < MAX_RETRIES) {
              devLog(`Login attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS[attempt]}ms...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
              continue;
            }
            toast.error('Network error. Please check your internet connection and try again.');
            throw new Error('Network error during sign in');
          }
          toast.error('An unexpected error occurred. Please try again.');
          throw networkError;
        }
      }

      if (error) {
        toast.error(error.message);
        throw error;
      }

      if (data.user) {
        // Check security profile for admin login validation
        const secProfile = await fetchSecurityProfileName(data.user.id);
        
        // Check admin login via profile_object_permissions (not profile name)
        if (role === 'admin') {
          // Get user's profile_id
          const { data: userProfileData } = await supabase
            .from('user_profiles')
            .select('profile_id')
            .eq('user_id', data.user.id)
            .maybeSingle();
          
          let hasAdminPerm = false;
          if (userProfileData?.profile_id) {
            const { data: perms } = await supabase
              .from('profile_object_permissions')
              .select('object_name')
              .eq('profile_id', userProfileData.profile_id)
              .like('object_name', 'admin_%')
              .eq('can_read', true)
              .limit(1);
            hasAdminPerm = (perms && perms.length > 0) || false;
          }
          
          if (!hasAdminPerm) {
            await supabase.auth.signOut();
            throw new Error(`Access denied. This account does not have admin privileges.`);
          }
        }
        
        // Check if user is active
        const { data: statusCheck } = await supabase
          .from('profiles')
          .select('user_status')
          .eq('id', data.user.id)
          .maybeSingle();
        
        if (statusCheck?.user_status === 'inactive') {
          await supabase.auth.signOut();
          toast.error('Your account has been deactivated. Please contact your administrator.');
          throw new Error('Account is inactive');
        }
        
        // Identify user for Firebase Performance tracing
        await monitoring.identifyUser(data.user.id);
        
        const profile = await fetchUserProfile(data.user.id);
        setUserProfile(profile);
        
        // Check if user must change password
        const { data: profileData } = await supabase
          .from('profiles')
          .select('must_change_password')
          .eq('id', data.user.id)
          .maybeSingle();
        
        if (profileData?.must_change_password) {
          setMustChangePassword(true);
          toast.info('Please change your password to continue');
          return;
        }
        
        toast.success('Signed in successfully!');
        
        // Request permissions after successful sign-in (both web and native)
        setTimeout(async () => {
          try {
            const locationGranted = await requestLocationPermission();
            if (!locationGranted) {
              toast.info('Location permission is needed for check-ins and GPS tracking');
            }
            
            // Request storage permission for offline mode
            await requestStoragePermission();
            
          } catch (error) {
            devError('Error requesting permissions:', error);
          }
        }, 1000);
      }
    });
  };

  const signOut = async () => {
    monitoring.logout();
    try {
      // Sign out from Supabase (no longer auto-cancels visits)
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        devError('Supabase signOut error:', error);
      }
    } catch (error) {
      devError('Error signing out:', error);
    }
    
    // Clear local session state
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserProfile(null);
    setSecurityProfileName(null);
    
    // Clear all auth-related storage with integrity cleanup
    // Also clear this user's permission cache to prevent cross-user data leakage
    const currentUserId = user?.id;
    if (currentUserId) {
      clearCachedPermissions(currentUserId);
    }
    clearCachedAuth();
    sessionStorage.clear();
    
    // Check if there are unsynced items before clearing
    let hasUnsynced = false;
    try {
      hasUnsynced = await offlineStorage.hasUnsyncedItems();
      if (hasUnsynced) {
        devLog('⚠️ Unsynced items detected — preserving ORDERS and SYNC_QUEUE on logout');
      }
    } catch (e) {
      devError('Error checking unsynced items:', e);
    }
    
    // CRITICAL: Clear Capacitor Preferences but preserve unsynced data
    try {
      if (!hasUnsynced) {
        await Preferences.clear();
        devLog('Cleared all Capacitor Preferences on sign out');
      } else {
        // Selectively clear Preferences keys EXCEPT orders and sync queue
        const keysToPreserve = ['offline_orders', 'offline_syncQueue', 'offline_syncLogs'];
        // We can't enumerate Preferences keys easily, so clear offline storage selectively
        devLog('Selective Preferences clear — preserving unsynced data');
      }
    } catch (prefError) {
      devError('Error clearing Preferences:', prefError);
    }
    
    // Clear offline storage — preserve unsynced orders if they exist
    try {
      await offlineStorage.clearAll(hasUnsynced);
      offlineStorage.clearMemoryCache();
      clearRetailerIndex();
      devLog('Cleared offline storage and memory caches on sign out');
    } catch (offlineError) {
      devError('Error clearing offline storage:', offlineError);
    }
    
    // Clear any Supabase-specific storage keys
    const supabaseKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('sb-') || key.startsWith('supabase')
    );
    supabaseKeys.forEach(key => localStorage.removeItem(key));
    
    // Create a clean URL without any query parameters
    const cleanUrl = `${window.location.origin}/auth`;
    
    // Force a hard redirect to clear any lingering state
    window.location.replace(cleanUrl);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const profile = await fetchUserProfile(user.id);
    if (profile) {
      setUserProfile(profile);
      localStorage.setItem('cached_profile', JSON.stringify(profile));
    }
  };

  const resetPasswordByEmail = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      return { error };
    } catch (error) {
      devError('Reset password error:', error);
      return { error: error as any };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      userProfile,
      securityProfileName,
      loading,
      mustChangePassword,
      onPasswordChanged,
      dismissPasswordChange,
      signUp,
      signIn,
      signOut,
      resetPasswordByEmail,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
