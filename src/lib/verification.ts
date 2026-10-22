import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, WaitlistEntry } from './supabase';

export function generateVerificationCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (100000 + (bytes[0] % 900000)).toString();
}

export function generateReferralCode(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

type RpcMessage = { success: boolean; message: string; cooldownRemaining?: number; session_token?: string };

export class DuplicateWaitlistEntryError extends Error {}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function createWaitlistEntry(email: string, phone: string, emailCode: string, smsCode: string, referredByCode?: string) {
  const { error } = await supabase.rpc('create_waitlist_entry', {
    p_email: email.trim().toLowerCase(), p_phone: normalizePhone(phone) || null,
    p_email_code: emailCode, p_sms_code: phone ? smsCode : null,
    p_referred_by_code: referredByCode?.trim() || null,
  });
  if (error?.code === '23505') {
    throw new DuplicateWaitlistEntryError('This email or phone number is already on the waitlist.');
  }
  if (error) throw new Error(error.message);
  // The API intentionally does not return private waitlist columns.
  return { email: email.trim().toLowerCase() } as Pick<WaitlistEntry, 'email'>;
}

export async function verifyEmailCode(email: string, code: string): Promise<RpcMessage> {
  return callRpc('verify_waitlist_email_code', { p_email: email.trim().toLowerCase(), p_code: code });
}

export async function verifySmsCode(phone: string, code: string): Promise<RpcMessage> {
  return callRpc('verify_waitlist_sms_code', { p_phone: normalizePhone(phone), p_code: code });
}

// Tier assignment is maintained by database triggers; no client row updates are permitted.
export async function updateTierBasedOnVerification(email: string): Promise<void> { void email; }

export async function getLeaderboard(limit = 50, userEmail?: string) {
  const { data, error } = await supabase.rpc('waitlist_leaderboard', { p_limit: limit, p_user_email: userEmail?.trim().toLowerCase() ?? null });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; email: string; tier: WaitlistEntry['tier']; referral_count: number; created_at: string; position: number; is_current_user: boolean }>;
}

export async function getWaitlistCount(): Promise<number> {
  return Number(await callRpc('waitlist_count', {}));
}

export async function getUserStats(sessionToken: string) {
  const data = await callRpc<{ referral_code: string; tier: WaitlistEntry['tier']; referral_count: number; position: number } | null>(
    'waitlist_user_stats', { p_session_token: sessionToken },
  );
  return data;
}

async function sendCode(functionName: string, body: Record<string, string>): Promise<RpcMessage> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
      if (error instanceof FunctionsHttpError && error.context instanceof Response) {
        const payload = await error.context.clone().json().catch(() => null);
        const message = typeof payload?.message === 'string' ? payload.message
          : typeof payload?.error === 'string' ? payload.error : null;
        if (message) return { success: false, message };
      }
      return { success: false, message: 'Could not contact the code-sending service. Please try again shortly.' };
    }
    return { success: Boolean(data?.success), message: data?.message ?? (data?.success ? 'Code sent successfully' : 'Could not send code') } as RpcMessage;
  } catch {
    // A network exception here must not make a signup appear unsaved: the
    // waitlist row may already have been created before delivery was attempted.
    return { success: false, message: 'Could not contact the code-sending service. Please try again shortly.' };
  }
}

export async function resendEmailCode(email: string): Promise<RpcMessage> {
  return sendCode('send_email_verification', { email: email.trim().toLowerCase(), resend: 'true' });
}

export async function resendSmsCode(phone: string): Promise<RpcMessage> {
  return sendCode('send_sms_verification', { phone: normalizePhone(phone), resend: 'true' });
}

export async function sendSignupVerificationCodes(email: string, emailCode: string, phone: string, smsCode: string): Promise<string[]> {
  const results = await Promise.all([
    sendCode('send_email_verification', { email: email.trim().toLowerCase(), code: emailCode }),
    ...(phone ? [sendCode('send_sms_verification', { phone: normalizePhone(phone), code: smsCode })] : []),
  ]);
  return results.filter((result) => !result.success).map((result) => result.message);
}

export async function sendLoginCode(email: string): Promise<RpcMessage> {
  return sendCode('send_email_verification', { email: email.trim().toLowerCase(), login: 'true' });
}

export async function verifyLoginCode(email: string, code: string): Promise<{
  success: boolean; message: string; sessionToken?: string; user?: { email: string; phone: string; email_verified: boolean; sms_verified: boolean }
}> {
  const result = await callRpc<{ success: boolean; message: string; session_token?: string; user?: { email: string; phone: string | null; email_verified: boolean; sms_verified: boolean } }>(
    'verify_waitlist_login_code', { p_email: email.trim().toLowerCase(), p_code: code },
  );
  return {
    ...result,
    sessionToken: result.session_token,
    user: result.user ? { ...result.user, phone: result.user.phone ?? '' } : undefined,
  };
}
