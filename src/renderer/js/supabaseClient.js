/**
 * SmartDocs - Supabase Client (Renderer / Browser)
 *
 * This module creates the Supabase client directly in the renderer using the
 * public anon/publishable key. Security is enforced by PostgreSQL Row Level Security
 * (RLS) policies on the backend — the anon key cannot bypass RLS.
 */

// Supabase project credentials (configured from project .env)
const DEFAULT_SUPABASE_URL  = 'https://jwaimenmdeanzjhqdpqw.supabase.co';
const DEFAULT_SUPABASE_ANON = 'sb_publishable_QS-zT3TFcbgvOED4frMY8Q_cPMm2dQ-';

function getSupabaseUrl() {
  return window.localStorage.getItem('smartdocs_supabase_url') || DEFAULT_SUPABASE_URL;
}

function getSupabaseAnon() {
  return window.localStorage.getItem('smartdocs_supabase_anon') || DEFAULT_SUPABASE_ANON;
}

/** Returns true when both credentials look like valid values */
function credentialsConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnon();
  return Boolean(
    url && url.startsWith('https://') &&
    key && key.length > 20
  );
}

/**
 * Lazily create the Supabase client (singleton).
 * Calling this when credentials are missing returns null gracefully.
 */
let _client = null;
function getClient() {
  if (_client) return _client;
  if (!credentialsConfigured()) return null;

  const url = getSupabaseUrl();
  const key = getSupabaseAnon();

  if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase UMD library not loaded.');
    return null;
  }

  // Create client with local storage session persistence
  _client = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage
    }
  });

  return _client;
}

window.SmartDocsSupabase = {
  getClient,
  credentialsConfigured,
  getSupabaseUrl,
  getSupabaseAnon
};
