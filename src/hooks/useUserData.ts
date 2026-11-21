import { useCallback, useEffect, useState } from 'react';
import { fetchUserData, type UserData } from '../data/repository';
import { friendlyError } from '../lib/supabase';

export function useUserData(userId: string | undefined) {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(await fetchUserData(userId));
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
