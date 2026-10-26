import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
