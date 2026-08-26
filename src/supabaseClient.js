import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This should never happen in a properly configured deploy — it means the
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars weren't set (either
  // in your local .env file, or in Netlify's Site settings > Environment
  // variables for a production deploy).
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

// The anon key is safe to ship in frontend code by design — it's a public
// key. Row Level Security policies (see supabase/schema.sql) are what
// actually control which rows a given logged-in user can read or write.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // keeps the user logged in across refreshes/visits
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
