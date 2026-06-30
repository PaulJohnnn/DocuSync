import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured =
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    supabaseUrl !== 'your_project_url' &&
    supabaseKey !== 'your_anon_key';

// Ensure we create a singleton client
const g = global as typeof globalThis & { _supabase?: ReturnType<typeof createClient> };

if (!g._supabase && isSupabaseConfigured) {
    g._supabase = createClient(supabaseUrl, supabaseKey);
}

export const supabase = g._supabase || null;
export default supabase;
