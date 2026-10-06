import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const storageKey = 'airnest-theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      return;
    }
  };
  return { theme, toggle };
}
