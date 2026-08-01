import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vutuiyhwpnxkcxsgcypu.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_cTSP_1BUjITwKFn507y9WA_9aI7Mly4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
