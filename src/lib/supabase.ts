import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.host);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isValidSupabaseUrl(configuredUrl) && Boolean(configuredAnonKey);

export const supabase = createClient(
  isSupabaseConfigured ? configuredUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? configuredAnonKey : 'placeholder-anon-key'
);

export interface WaitlistEntry {
  id: string;
  email: string;
  phone: string | null;
  email_verified: boolean;
  sms_verified: boolean;
  email_verification_code: string | null;
  email_verification_code_expires_at: string | null;
  sms_verification_code: string | null;
  sms_verification_code_expires_at: string | null;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  referral_code: string;
  referral_count: number;
  referred_by_code: string | null;
  created_at: string;
  updated_at: string;
}
