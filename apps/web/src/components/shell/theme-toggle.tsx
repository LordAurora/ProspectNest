'use client';

import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const labels: Record<Theme, string> = { system: 'Tema: sistem', light: 'Tema: açık', dark: 'Tema: koyu' };
const icons = { system: Monitor, light: Sun, dark: Moon } as const;

export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  const Icon = icons[theme];
  return (
    <button
      type="button"
      onClick={() => {
        const value = next[theme];
        applyTheme(value);
        setTheme(value);
      }}
      className="flex size-9 items-center justify-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
      aria-label={`${labels[theme]}. Değiştirmek için tıklayın.`}
      title={labels[theme]}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
