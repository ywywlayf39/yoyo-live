import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// These are public client settings. RLS protects database rows; never place a
// service_role or secret key in this app.
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://wpvcecxkpoldhdhooszb.supabase.co';
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_QmTBI7SNQBJxiQxXMStX8A_HDOzDR5Q';

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
