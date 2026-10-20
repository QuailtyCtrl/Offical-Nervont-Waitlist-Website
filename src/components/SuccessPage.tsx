import { useEffect, useState } from 'react';
import { CheckCircle, Copy, Lock } from 'lucide-react';
import { getUserStats } from '../lib/verification';
import { Leaderboard } from './Leaderboard';

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

interface SuccessStats {
  referral_code: string;
  tier: Tier;
  referral_count: number;
  position: number;
}

interface SuccessPageProps {
  email: string;
}

export function SuccessPage({ email }: SuccessPageProps) {
  const [stats, setStats] = useState<SuccessStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const userStats = await getUserStats(email);
        setStats(userStats);
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [email]);

  const handleCopyLink = async () => {
    const referralLink = `${window.location.origin}?ref=${stats?.referral_code}`;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your referral link:', referralLink);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  if (!stats) {
    return <p className="text-sm text-red-700">We couldn’t load your waitlist details. Please try logging in again.</p>;
  }

  const allBenefits = [
    { name: 'Early access', requiredTier: 'bronze' as Tier },
    { name: 'Exclusive drops', requiredTier: 'silver' as Tier },
    { name: '20% discount', requiredTier: 'gold' as Tier },
    { name: 'VIP events', requiredTier: 'platinum' as Tier },
    { name: 'Personal stylist', requiredTier: 'platinum' as Tier },
  ];

  const tierHierarchy: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
  const currentTierLevel = tierHierarchy[stats.tier];

  const tierInfo: Record<Tier, { title: string }> = {
    bronze: { title: 'Bronze' },
    silver: { title: 'Silver' },
    gold: { title: 'Gold' },
    platinum: { title: 'Platinum' },
  };

  const currentTier = tierInfo[stats.tier];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <CheckCircle className="w-16 h-16 text-emerald-600 animate-scaleIn" />
            <span className="absolute -bottom-2 -right-2 text-2xl animate-bounce">✨</span>
          </div>
        </div>
        <h2 className="text-2xl font-light">You're In!</h2>
        <p className="text-gray-600">Welcome to the <span className="brand-nervont">Nervont</span> early access program.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 py-6 px-4 bg-gray-50 rounded border border-gray-200">
        <div className="text-center">
          <p className="text-gray-600 text-xs mb-1">Your Position</p>
          <p className="text-2xl font-light">#{stats.position}</p>
        </div>
        <div className="text-center border-l border-r border-gray-300">
          <p className="text-gray-600 text-xs mb-1">Tier</p>
          <p className={`text-lg tier-${stats.tier}`}>{currentTier.title}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-600 text-xs mb-1">Referrals</p>
          <p className="text-2xl font-light">{stats.referral_count}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Your <span className={`tier-${stats.tier}`}>{currentTier.title}</span> Benefits</h3>
        <div className="space-y-2">
          {allBenefits.map((benefit, i) => {
            const isUnlocked = currentTierLevel >= tierHierarchy[benefit.requiredTier];
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded border animate-slideDown ${
                  isUnlocked
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-gray-50 border-gray-200 opacity-60'
                }`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {isUnlocked ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-sm ${isUnlocked ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                  {benefit.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Invite Friends & Climb Ranks</h3>
        <p className="text-xs text-gray-600">Reach higher tiers with referrals and unlock exclusive perks</p>

        <div className="flex gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-black text-white text-sm font-medium uppercase tracking-widest hover:bg-gray-900 transition-colors rounded"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 space-y-1">
          <p className="font-medium">Referral Progress</p>
          <p>
            {stats.tier === 'bronze' ? 'Get verified via SMS to unlock Silver tier' :
             stats.tier === 'silver' ? '1 more referral to reach Gold' :
             stats.tier === 'gold' ? 'Climb to top 10 to reach Platinum' :
             'You\'ve reached Platinum!'}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <Leaderboard userEmail={email} userPosition={stats.position} />
      </div>

      <div className="p-4 bg-gray-50 rounded border border-gray-200 space-y-2">
        <p className="text-xs font-medium text-gray-900">What's Next?</p>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Watch for our launch announcement</li>
          <li>• Invite friends to increase your rank</li>
          <li>• Check your email for exclusive updates</li>
        </ul>
      </div>
    </div>
  );
}
