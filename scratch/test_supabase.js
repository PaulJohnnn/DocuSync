const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../web/.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'example-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Creating matchmaker_lobbies table...");
    // We can use RPC if available, or just insert if we don't have schema privileges?
    // Wait, the anon key cannot create tables. Only service role key can.
    // If we only have anon key, we cannot create tables via JS.
    console.log("Supabase URL:", supabaseUrl);
    
    // Let's check if we can query it
    const { data, error } = await supabase.from('matchmaker_lobbies').select('*').limit(1);
    console.log("Query result:", data, error);
}

run();
