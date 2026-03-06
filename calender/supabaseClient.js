const fs = require('fs');
const path = require('path');

// read from environment or fallbacks
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_API_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

let createClient = null;
const supabasePackagePath = path.join(__dirname, 'node_modules', '@supabase', 'supabase-js');
if (fs.existsSync(supabasePackagePath)) {
    ({ createClient } = require('@supabase/supabase-js'));
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && createClient) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

module.exports = supabase;
