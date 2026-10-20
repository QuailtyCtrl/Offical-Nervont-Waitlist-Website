import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { createWaitlistEntry, checkDuplicateEmail, checkDuplicatePhone, generateVerificationCode, normalizePhone } from '../lib/verification';

interface SignupFormProps {
  onSuccess: (email: string, phone: string, deliveryNotice?: string | null) => void;
}

export function SignupForm({ onSuccess }: SignupFormProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      setReferralCode(ref);
    }
  }, []);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validatePhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    const hasCountryCode = digits.length === 11 && digits.startsWith('1');
    const nationalNumber = hasCountryCode ? digits.slice(1) : digits;
    const countryPrefix = hasCountryCode ? '+1 ' : '';
    if (nationalNumber.length <= 3) return `${countryPrefix}${nationalNumber}`;
    if (nationalNumber.length <= 6) return `${countryPrefix}(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3)}`;
    return `${countryPrefix}(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    setError('');
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!validateEmail(email)) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      if (phone && !validatePhone(phone)) {
        setError('Please enter a valid phone number');
        setLoading(false);
        return;
      }

      const emailExists = await checkDuplicateEmail(email);
      if (emailExists) {
        setError('This email is already on the waitlist');
        setLoading(false);
        return;
      }

      if (phone) {
        const phoneExists = await checkDuplicatePhone(phone);
        if (phoneExists) {
          setError('This phone number is already on the waitlist');
          setLoading(false);
          return;
        }
      }

      const emailCode = generateVerificationCode();
      const smsCode = generateVerificationCode();

      const normalizedEmail = email.trim().toLowerCase();
      await createWaitlistEntry(normalizedEmail, phone, emailCode, smsCode, referralCode || undefined);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const normalizedPhone = phone ? normalizePhone(phone) : '';

      const requests = [
        fetch(`${supabaseUrl}/functions/v1/send_email_verification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: normalizedEmail, code: emailCode }),
        }),
      ];

      if (phone) {
        requests.push(
          fetch(`${supabaseUrl}/functions/v1/send_sms_verification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone: normalizedPhone, code: smsCode }),
          })
        );
      }

      const responses = await Promise.allSettled(requests);
      const deliveryFailed = responses.some(
        (result) => result.status === 'rejected' || !result.value.ok
      );

      setSuccess(true);
      onSuccess(
        normalizedEmail,
        phone,
        deliveryFailed
          ? 'Your signup was saved, but a verification message could not be sent. Use the resend button below to try again.'
          : null
      );
    } catch (err) {
      setError('Failed to sign up. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="animate-fadeIn">
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-emerald-600" />
        </div>
        <h3 className="text-xl font-light text-center mb-2">Welcome to <span className="brand-nervont">Nervont</span></h3>
        <p className="text-gray-600 text-center text-sm">
          Check your email{phone ? ' and text message' : ''} for verification code{phone ? 's' : ''}. You're almost there!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-xs uppercase tracking-widest text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="your@email.com"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-colors text-sm"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="phone" className="block text-xs uppercase tracking-widest text-gray-700">
          Phone <span className="text-gray-400">(Optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="(123) 456-7890"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-colors text-sm"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md animate-slideDown">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-black text-white text-sm font-medium uppercase tracking-widest hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 group"
      >
        {loading ? 'Joining...' : 'Join Waitlist'}
        {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
      </button>

      <p className="text-center text-xs text-gray-500">
        We'll send a verification code to your email{phone ? ' and phone' : ''}
      </p>
    </form>
  );
}
