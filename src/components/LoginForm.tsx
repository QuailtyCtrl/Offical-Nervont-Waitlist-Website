import { useState, useRef } from 'react';
import { AlertCircle, Mail } from 'lucide-react';
import { sendLoginCode, verifyLoginCode } from '../lib/verification';

interface LoginFormProps {
  onLoginSuccess: (email: string, phone: string, emailVerified: boolean, smsVerified: boolean) => void;
  onBackToSignup: () => void;
}

export function LoginForm({ onLoginSuccess, onBackToSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [codes, setCodes] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!validateEmail(email)) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      const result = await sendLoginCode(email);

      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      setCodeSent(true);
    } catch (err) {
      setError('Failed to send login code. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
  };

  const handleVerify = async (fullCode?: string) => {
    const code = fullCode || codes.join('');

    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyLoginCode(email, code);

      if (!result.success) {
        setError(result.message);
        setCodes(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      if (result.user) {
        onLoginSuccess(result.user.email, result.user.phone, result.user.email_verified, result.user.sms_verified);
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    handleVerify();
  };

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-light mb-6">Welcome Back . . .</h2>

      {!codeSent ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-xs uppercase tracking-widest text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="your@email.com"
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
            {loading ? 'Sending Code...' : 'Send Login Code'}
            {!loading && <Mail className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
          </button>

          <button
            type="button"
            onClick={onBackToSignup}
            className="w-full text-center text-sm text-gray-600 hover:text-black transition-colors"
          >
            Don't have an account? Sign up
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="space-y-2">
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
                  autoFocus={index === 0}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded mb-4 animate-slideDown">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || codes.join('').length !== 6}
            className="w-full py-2 bg-black text-white text-sm font-medium uppercase tracking-widest hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify & Log In'}
          </button>

          <button
            type="button"
            onClick={() => {
              setCodeSent(false);
              setCodes(['', '', '', '', '', '']);
              setError('');
            }}
            className="w-full text-center text-sm text-gray-600 hover:text-black transition-colors"
          >
            Change email
          </button>
        </form>
      )}
    </div>
  );
}
