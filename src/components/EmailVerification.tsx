import { useState, useRef, useEffect } from 'react';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { resendEmailCode } from '../lib/verification';

interface EmailVerificationProps {
  email: string;
  onVerify: (code: string) => Promise<boolean>;
  allowImmediateResend?: boolean;
}

export function EmailVerification({ email, onVerify, allowImmediateResend = false }: EmailVerificationProps) {
  const [codes, setCodes] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(allowImmediateResend ? 0 : 60);
  const [successMessage, setSuccessMessage] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCodes = [...codes];
    newCodes[index] = value.slice(-1);
    setCodes(newCodes);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCodes = text.split('').concat(['', '', '', '', '', '']).slice(0, 6) as string[];
    setCodes(newCodes);
    if (text.length === 6) {
      handleVerify(newCodes.join(''));
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const code = fullCode || codes.join('');

    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const success = await onVerify(code);
      if (!success) {
        setError('Invalid verification code');
        setCodes(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Could not verify the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    setSuccessMessage('');

    try {
      const result = await resendEmailCode(email);
      if (result.success) {
        setSuccessMessage(result.message);
        setCooldown(60);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-4 animate-slideDown">
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Enter code from your email
        </label>
        <p className="text-sm text-gray-600 mb-4">
          We sent a 6-digit code to {email}
        </p>

        <div className="flex gap-2 mb-4" onPaste={handlePaste}>
          {codes.map((code, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-10 h-12 text-center text-lg font-semibold text-black bg-white border border-gray-300 rounded focus:border-black focus:outline-none focus:ring-1 focus:ring-black transition-colors"
              disabled={loading}
              placeholder="-"
            />
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded mb-4 animate-slideDown">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded mb-4 animate-slideDown">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}

        <button
          onClick={() => handleVerify()}
          disabled={loading || codes.join('').length !== 6}
          className="w-full py-2 bg-black text-white text-sm font-medium uppercase tracking-widest hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Verifying...' : 'Verify Email'}
        </button>

        <button
          onClick={handleResend}
          disabled={resending || cooldown > 0}
          className="w-full mt-3 text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
          {resending ? 'resending...' : cooldown > 0 ? `resend in ${cooldown}s` : 'resend code'}
        </button>
      </div>
    </div>
  );
}
