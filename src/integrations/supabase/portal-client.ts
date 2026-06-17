import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Note: intentionally untyped (no <Database> generic) to avoid TS2589
// "type instantiation excessively deep" caused by the very large generated
// Database type. Runtime behavior is identical to the main client.
export const customerPortalSupabase: SupabaseClient<any, 'public', any> = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
