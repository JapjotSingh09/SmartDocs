/**
 * Supabase Client Configuration
 * 
 * IMPORTANT SECURITY RULES:
 * 1. Use ONLY the Supabase Project URL and public anon/publishable key.
 * 2. NEVER expose the Supabase service-role/secret key or database password.
 * 3. The anon key is safe in client apps because security is enforced
 *    by PostgreSQL Row Level Security (RLS) policies on the backend.
 */

const path = require('path');
// Load environment variables from .env file in project root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_SUPABASE_URL = 'https://jwaimenmdeanzjhqdpqw.supabase.co';
const DEFAULT_SUPABASE_ANON = 'sb_publishable_QS-zT3TFcbgvOED4frMY8Q_cPMm2dQ-';

const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON;

/**
 * Validates whether valid Supabase credentials have been configured.
 */
function isConfigured() {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR_PROJECT_ID') &&
    !supabaseAnonKey.includes('YOUR_ANON_KEY')
  );
}

module.exports = {
  supabaseUrl,
  supabaseAnonKey,
  isConfigured
};
