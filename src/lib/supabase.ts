import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Supabase is only "live" when real credentials are provided.
// Until then, the app falls back gracefully to localStorage.
export const isSupabaseConfigured =
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    supabaseUrl !== 'your_project_url' &&
    supabaseKey !== 'your_anon_key';

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export default supabase;
