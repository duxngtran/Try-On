import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

let client;
/** Client dùng chung, service role key — chỉ backend (D-02). Tạo khi cần lần đầu. */
export function getSupabase() {
  if (!client) {
    const env = getEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
