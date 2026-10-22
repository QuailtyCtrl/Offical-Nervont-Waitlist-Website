import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SignupForm } from './components/SignupForm';
import { LoginForm } from './components/LoginForm';
import { VerificationFlow } from './components/VerificationFlow';
import { SuccessPage } from './components/SuccessPage';
import { isSupabaseConfigured } from './lib/supabase';

type Step = 'signup' | 'login' | 'verification' | 'success';

function App() {
  const [step, setStep] = useState<Step>('signup');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [smsVerified, setSmsVerified] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  const handleSignupSuccess = (email: string, phone: string, notice?: string | null) => {
    setUserEmail(email);
    setUserPhone(phone);
    setEmailVerified(false);
    setSmsVerified(false);
    setDeliveryNotice(notice ?? null);
    setStep('verification');
  };

  const handleLoginSuccess = (email: string, phone: string, emailVerified: boolean, smsVerified: boolean) => {
    setUserEmail(email);
    setUserPhone(phone);
    setEmailVerified(emailVerified);
    setSmsVerified(smsVerified);
    setDeliveryNotice(null);

    const hasPhone = phone && phone.trim() !== '';

    if (emailVerified && (smsVerified || !hasPhone)) {
      setStep('success');
    } else {
      setStep('verification');
    }
  };

  const handleVerificationComplete = () => {
    setStep('success');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-20">
            <div className="lg:col-span-1 flex flex-col">
              <div>
                <h1 className="text-5xl">
                  Nervont
                </h1>
                <p className="text-lg text-gray-600 font-light leading-relaxed mb-6">
                  Luxury Lifestyle. Early Access. Exclusive Perks.
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">📦</span>
                    <div>
                      <p className="font-medium text-sm">Early Access</p>
                      <p className="text-xs text-gray-600">Launch drops first</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🎁</span>
                    <div>
                      <p className="font-medium text-sm">VIP Discounts</p>
                      <p className="text-xs text-gray-600">Up to 20% off</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">👑</span>
                    <div>
                      <p className="font-medium text-sm">Exclusive Status</p>
                      <p className="text-xs text-gray-600">Premium member benefits</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-8">
              <div className="bg-white">
                {!isSupabaseConfigured ? (
                  <div className="animate-fadeIn p-4 border border-red-200 bg-red-50">
                    <h2 className="text-2xl font-light mb-3">Site is not configured</h2>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {import.meta.env.DEV
                        ? <>Add <code className="text-xs">VITE_SUPABASE_URL</code> and <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> to <code className="text-xs">.env.local</code> in the project root, then restart the dev server.</>
                        : 'This site is temporarily unavailable. Please try again later.'}
                    </p>
                  </div>
                ) : step === 'signup' && (
                  <div className="animate-fadeIn">
                    <h2 className="text-2xl font-light mb-6">Join the Waitlist</h2>
                    <SignupForm onSuccess={handleSignupSuccess} />
                    <button
                      onClick={() => setStep('login')}
                      className="w-full mt-4 text-center text-sm text-gray-600 hover:text-black transition-colors"
                    >
                      Already joined? Log in
                    </button>
                  </div>
                )}

                {step === 'login' && (
                  <LoginForm
                    onLoginSuccess={handleLoginSuccess}
                    onBackToSignup={() => setStep('signup')}
                  />
                )}

                {step === 'verification' && (
                  <div className="animate-fadeIn">
                    <h2 className="text-2xl font-light mb-6">Verify Your Details</h2>
                    <VerificationFlow
                      email={userEmail}
                      phone={userPhone}
                      initialEmailVerified={emailVerified}
                      initialSmsVerified={smsVerified}
                      onComplete={handleVerificationComplete}
                      deliveryNotice={deliveryNotice}
                    />
                  </div>
                )}

                {step === 'success' && (
                  <div className="animate-fadeIn">
                    <SuccessPage email={userEmail} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 py-6 px-4 text-center text-xs text-gray-600">
        <p>© 2025 NERVONT APPAREL. All rights reserved. | Nervont LC</p>
      </footer>
      <Analytics />
    </div>
  );
}

export default App;
