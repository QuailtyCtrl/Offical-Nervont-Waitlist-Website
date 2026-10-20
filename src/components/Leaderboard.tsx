import { useState, useEffect, useCallback } from 'react';
import { Crown, Zap } from 'lucide-react';
import { getLeaderboard, getWaitlistCount } from '../lib/verification';

interface LeaderboardEntry {
  id: string;
  email: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  referral_count: number;
  created_at: string;
  position: number;
  is_current_user: boolean;
}

interface LeaderboardProps {
  userEmail?: string;
  userPosition?: number;
}

const tierColors = {
  bronze: { bg: 'bg-white', text: 'text-gray-700', border: 'border-gray-200' },
  silver: { bg: 'bg-white', text: 'text-gray-700', border: 'border-gray-200' },
  gold: { bg: 'bg-white', text: 'text-gray-700', border: 'border-gray-200' },
  platinum: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
};

const tierBadges = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '👑',
};

export function Leaderboard({ userEmail, userPosition }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const loadLeaderboard = useCallback(async () => {
    try {
      const [data, count] = await Promise.all([getLeaderboard(50, userEmail), getWaitlistCount()]);
      setEntries(data);
      setTotalCount(count);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Waitlist Leaderboard</h3>
          <p className="text-xs text-gray-600 mt-1">{totalCount} members on the waitlist</p>
        </div>
        {userPosition && (
          <div className="text-right">
            <p className="text-xs text-gray-600">Your Position</p>
            <p className="text-2xl font-light text-black">#{userPosition}</p>
          </div>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
        {entries.map((entry, index) => {
          const colors = tierColors[entry.tier];
          const badge = tierBadges[entry.tier];
          const isUserEntry = entry.is_current_user;
          const isTop5 = index < 5;

          return (
            <div
              key={entry.id}
              className={`p-3 rounded border transition-all ${
                isTop5
                  ? 'bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-50 border-yellow-300 shadow-md'
                  : `${colors.bg} ${colors.border}`
              } ${
                isUserEntry ? 'border-2 border-black' : 'border'
              } animate-slideDown`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="text-lg font-light w-8 text-right">
                    {entry.position === 1 ? (
                      <Crown className="w-5 h-5 text-yellow-600" />
                    ) : isTop5 ? (
                      <span className="text-yellow-700 font-bold">#{entry.position}</span>
                    ) : (
                      <span className="text-gray-600">#{entry.position}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isTop5 ? 'text-gray-900' : 'text-gray-900'}`}>
                      {entry.email}
                    </p>
                    <p className="text-xs text-gray-600">Joined recently</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {entry.referral_count > 0 && (
                    <div className={`flex items-center gap-1 text-xs ${isTop5 ? 'text-yellow-700' : 'text-gray-700'}`}>
                      <Zap className="w-3 h-3" />
                      <span>{entry.referral_count}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs tier-${entry.tier} capitalize`}>{entry.tier}</span>
                    <span className="text-lg">{badge}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600 text-center">
          Complete verification to climb the ranks
        </p>
      </div>
    </div>
  );
}
