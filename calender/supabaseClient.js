const { createClient } = require('@supabase/supabase-js');

// read from environment or fallbacks
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_API_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

module.exports = supabase;
