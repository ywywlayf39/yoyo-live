import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// These are public client settings. RLS protects database rows; never place a
// service_role or secret key in this app.
export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://wpvcecxkpoldhdhooszb.supabase.co';
export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_QmTBI7SNQBJxiQxXMStX8A_HDOzDR5Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Password-reset links are handled with exchangeCodeForSession in App.js.
    // Explicit PKCE ensures Supabase stores the verifier needed for that exchange.
    flowType: 'pkce',
    detectSessionInUrl: typeof window !== 'undefined' && !!window.location?.href,
  },
});
