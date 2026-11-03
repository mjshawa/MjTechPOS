import { useEffect } from 'react';
import { usePersistentState } from './storage';

/** Remembers the choice on the device and applies it to <html data-theme>. */
export function useTheme(): ['dark' | 'light', () => void] {
  const [theme, setTheme] = usePersistentState('theme', 'dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return [theme, () => setTheme((t: string) => (t === 'dark' ? 'light' : 'dark'))];
}
