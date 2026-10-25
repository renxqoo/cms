'use client';

import { useEffect, useRef, useState } from 'react';

export function fragmentToken(hash: string): string | null {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const tokens = values.getAll('token');
  const [token] = tokens;
  return tokens.length === 1 && token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function useActionToken() {
  const captured = useRef(false);
  const [token, setToken] = useState<string | null | undefined>();
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const value = fragmentToken(window.location.hash);
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
    setToken(value);
  }, []);
  return { token, forget: () => setToken(null) };
}
