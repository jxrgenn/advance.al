import { useState, useRef } from 'react';
import { authApi } from '@/lib/api';

export type EmailAvailabilityStatus = 'idle' | 'checking' | 'taken' | 'free';

export function useEmailAvailability() {
  const [status, setStatus] = useState<EmailAvailabilityStatus>('idle');
  const lastChecked = useRef<string>('');

  const check = async (rawEmail: string) => {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setStatus('idle');
      return;
    }
    if (email === lastChecked.current) return;
    lastChecked.current = email;
    setStatus('checking');
    const r = await authApi.checkEmail(email);
    if (lastChecked.current !== email) return;
    setStatus(r.available ? 'free' : 'taken');
  };

  const reset = () => {
    setStatus('idle');
    lastChecked.current = '';
  };

  return { status, check, reset };
}
