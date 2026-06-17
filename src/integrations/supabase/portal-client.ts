import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Note: typed as a loosely-typed SupabaseClient to avoid TS2589 (excessively deep
// type instantiation) caused by the very large generated Database type. The
// portal client only hits a small set of tables; runtime behavior is unchanged.
export const customerPortalSupabase: SupabaseClient<Database> = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
) as unknown as SupabaseClient<Database>;
