import { useState, useEffect } from 'react';
import { Mail, MessageSquare, Check, ArrowRight } from 'lucide-react';
import { verifyEmailCode, verifySmsCode, updateTierBasedOnVerification } from '../lib/verification';
import { EmailVerification } from './EmailVerification';
import { SmsVerification } from './SmsVerification';

interface VerificationFlowProps {
  email: string;
  phone: string;
  onComplete: () => void;
  onSessionToken: (token: string) => void;
  deliveryNotice?: string | null;
  initialEmailVerified?: boolean;
  initialSmsVerified?: boolean;
}

export function VerificationFlow({ email, phone, onComplete, onSessionToken, deliveryNotice, initialEmailVerified = false, initialSmsVerified = false }: VerificationFlowProps) {
  const [emailVerified, setEmailVerified] = useState(initialEmailVerified);
  const [smsVerified, setSmsVerified] = useState(initialSmsVerified);
  const [loading, setLoading] = useState(false);
  const hasPhone = phone && phone.trim() !== '';

  useEffect(() => {
    if (emailVerified && (smsVerified || !hasPhone)) {
      setLoading(true);
      updateTierBasedOnVerification(email).catch((error) => {
        console.error('Failed to update membership tier:', error);
      }).finally(() => {
        setTimeout(() => {
          onComplete();
        }, 1000);
      });
    }
  }, [emailVerified, smsVerified, hasPhone, email, onComplete]);

  const handleEmailVerify = async (code: string) => {
    const result = await verifyEmailCode(email, code);
    if (result.success) {
      if (result.session_token) onSessionToken(result.session_token);
      setEmailVerified(true);
      return true;
    }
    return result.message;
  };

  const handleSmsVerify = async (code: string) => {
    const result = await verifySmsCode(phone, code);
    if (result.success) {
      setSmsVerified(true);
      return true;
    }
    return result.message;
  };

  const handleSkipSms = () => {
    setLoading(true);
    updateTierBasedOnVerification(email).catch((error) => {
      console.error('Failed to update membership tier:', error);
    }).finally(() => {
      setTimeout(() => {
        onComplete();
      }, 1000);
    });
  };

  return (
    <div className="space-y-6">
      {deliveryNotice && (
        <p role="status" className="p-3 border border-amber-200 bg-amber-50 text-sm text-amber-900">{deliveryNotice}</p>
      )}
      {hasPhone && (
        <div className="flex justify-between items-center mb-8">
          <div className={`flex items-center gap-2 ${emailVerified ? 'opacity-100' : 'opacity-60'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium transition-all ${emailVerified ? 'bg-emerald-600' : 'bg-gray-400'}`}>
              {emailVerified ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            </div>
            <span className="text-sm font-medium">Email</span>
          </div>

          <div className="flex-1 h-px bg-gray-200 mx-4" />

          <div className={`flex items-center gap-2 ${smsVerified ? 'opacity-100' : 'opacity-60'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium transition-all ${smsVerified ? 'bg-emerald-600' : 'bg-gray-400'}`}>
              {smsVerified ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            </div>
            <span className="text-sm font-medium">SMS</span>
          </div>
        </div>
      )}

      {!emailVerified ? (
        <EmailVerification email={email} onVerify={handleEmailVerify} allowImmediateResend={Boolean(deliveryNotice)} />
      ) : (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 animate-slideDown">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-700">Email verified</span>
        </div>
      )}

      {hasPhone && !smsVerified ? (
        <>
          <SmsVerification phone={phone} onVerify={handleSmsVerify} allowImmediateResend={Boolean(deliveryNotice)} />
          {emailVerified && (
            <button
              onClick={handleSkipSms}
              disabled={loading}
              className="w-full py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 group"
            >
              Continue without SMS
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </>
      ) : hasPhone && smsVerified ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 animate-slideDown">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-700">SMS verified</span>
        </div>
      ) : null}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
            <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      )}
    </div>
  );
}
