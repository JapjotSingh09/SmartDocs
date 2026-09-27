/**
 * Supabase Service Module (Electron Main Process)
 * 
 * Handles all Supabase authentication, database queries, and session management.
 * Running Supabase in the Main Process keeps renderer security tight (Node integration disabled,
 * strict CSP) and avoids packing issues with frontend bundlers.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../../config/supabaseConfig');
const sessionStorage = require('./sessionStorage');

class SupabaseService {
  constructor() {
    this.client = null;
    this.authStateListeners = [];
  }

  /**
   * Initializes the Supabase client with persistent session storage.
   */
  getClient() {
    if (this.client) {
      return this.client;
    }

    if (!config.isConfigured()) {
      return null;
    }

    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });

    // Listen for auth state changes from Supabase SDK
    this.client.auth.onAuthStateChange((event, session) => {
      this.authStateListeners.forEach((listener) => {
        try {
          listener(event, session);
        } catch (err) {
          console.error('[SupabaseService] Error in auth state listener:', err);
        }
      });
    });

    return this.client;
  }

  /**
   * Register a listener for auth state changes (e.g. to notify renderer over IPC)
   */
  onAuthStateChange(callback) {
    this.authStateListeners.push(callback);
  }

  /**
   * Map Supabase API error messages to friendly, user-facing explanations.
   */
  formatAuthError(error) {
    if (!error) return 'An unexpected error occurred.';
    const msg = error.message || '';
    if (msg.includes('Invalid login credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (msg.includes('User already registered')) {
      return 'An account with this email already exists. Please log in instead.';
    }
    if (msg.includes('Password should be at least')) {
      return 'Password must be at least 6 characters long.';
    }
    if (msg.includes('Email not confirmed')) {
      return 'Please confirm your email address before logging in.';
    }
    if (msg.includes('rate limit')) {
      return 'Too many attempts. Please wait a few minutes before trying again.';
    }
    return msg;
  }

  /**
   * Sign Up a new user and create their corresponding profile row.
   * Requirement 5:
   * - Create Supabase Auth user
   * - Create row in public.profiles where id = user.id and full_name = fullName
   */
  async signUp(fullName, email, password) {
    if (!config.isConfigured()) {
      return {
        success: false,
        error: 'Supabase credentials are not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file.'
      };
    }

    const supabase = this.getClient();

    try {
      // 1. Create auth user with metadata
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (error) {
        return { success: false, error: this.formatAuthError(error) };
      }

      const user = data.user;
      if (!user) {
        return { success: false, error: 'Registration failed. No user was returned by the server.' };
      }

      // 2. Create the corresponding profile in public.profiles table
      // (profiles.id = user.id, profiles.full_name = fullName)
      let profileCreated = false;
      try {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: fullName.trim()
          });

        if (profileError) {
          console.warn('[SupabaseService] Profile upsert notice:', profileError.message);
        } else {
          profileCreated = true;
        }
      } catch (profileErr) {
        console.warn('[SupabaseService] Profile creation error:', profileErr);
      }

      const emailConfirmationRequired = !data.session;

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: fullName.trim()
        },
        session: data.session,
        profileCreated,
        emailConfirmationRequired,
        message: emailConfirmationRequired
          ? 'Account created! Please check your email to confirm your account before logging in.'
          : 'Account created successfully!'
      };
    } catch (err) {
      console.error('[SupabaseService] Sign up exception:', err);
      return { success: false, error: err.message || 'An unexpected error occurred during signup.' };
    }
  }

  /**
   * Log In an existing user with email and password.
   * Requirement 6:
   * - Retrieve current authenticated user and profile
   */
  async signIn(email, password) {
    if (!config.isConfigured()) {
      return {
        success: false,
        error: 'Supabase credentials are not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file.'
      };
    }

    const supabase = this.getClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        return { success: false, error: this.formatAuthError(error) };
      }

      const user = data.user;
      const session = data.session;

      // Fetch user profile from public.profiles table
      let profile = null;
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, created_at')
          .eq('id', user.id)
          .maybeSingle();

        profile = profileData;
      } catch (profileErr) {
        console.warn('[SupabaseService] Could not fetch profile on login:', profileErr.message);
      }

      const resolvedFullName = profile?.full_name || user.user_metadata?.full_name || '';

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: resolvedFullName
        },
        session: session,
        profile: profile
      };
    } catch (err) {
      console.error('[SupabaseService] Sign in exception:', err);
      return { success: false, error: err.message || 'An unexpected error occurred during login.' };
    }
  }

  /**
   * Log out the current user and clear stored session.
   */
  async signOut() {
    if (!config.isConfigured()) {
      return { success: true };
    }

    const supabase = this.getClient();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('[SupabaseService] Sign out warning:', error.message);
      }
      return { success: true };
    } catch (err) {
      console.error('[SupabaseService] Sign out error:', err);
      return { success: true }; // Allow UI to proceed with logout even on network error
    }
  }

  /**
   * Get current active session on startup or page refresh.
   * Requirement 7: Check whether a Supabase session already exists.
   */
  async getSession() {
    if (!config.isConfigured()) {
      return {
        isConfigured: false,
        session: null,
        user: null
      };
    }

    const supabase = this.getClient();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data || !data.session) {
        return {
          isConfigured: true,
          session: null,
          user: null
        };
      }

      const session = data.session;
      const user = session.user;

      // Fetch profile
      let profile = null;
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, created_at')
          .eq('id', user.id)
          .maybeSingle();

        profile = profileData;
      } catch (err) {
        console.warn('[SupabaseService] Profile fetch error in getSession:', err.message);
      }

      const resolvedFullName = profile?.full_name || user.user_metadata?.full_name || '';

      return {
        isConfigured: true,
        session: session,
        user: {
          id: user.id,
          email: user.email,
          fullName: resolvedFullName
        },
        profile: profile
      };
    } catch (err) {
      console.error('[SupabaseService] getSession exception:', err);
      return {
        isConfigured: true,
        session: null,
        user: null
      };
    }
  }
}

module.exports = new SupabaseService();
