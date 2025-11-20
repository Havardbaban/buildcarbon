// src/lib/supabase.ts

import { createClient } from "@supabase/supabase-js";

// These should already exist in your .env / Vercel env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase env vars VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export as default *and* named, so both styles work:
//   import supabase from "./lib/supabase";
//   import { supabase } from "./lib/supabase";
export default supabase;
