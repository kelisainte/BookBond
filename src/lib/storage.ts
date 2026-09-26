import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function storage() {
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY) throw new Error('Media storage is not configured');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}}).storage.from('copy-evidence');
}
