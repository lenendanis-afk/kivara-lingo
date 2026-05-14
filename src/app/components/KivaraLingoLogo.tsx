import React from 'react';

interface KivaraLingoLogoProps {
  className?: string;
  size?: number;
  isDark?: boolean;
}

export function KivaraLingoLogo({ className = "", size = 24, isDark = false }: KivaraLingoLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size * 1.1}
        height={size * 1.1}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-indigo-500 dark:text-indigo-400"
        aria-label="Kivara Lingo"
      >
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <line x1="7" y1="12" x2="13" y2="12" />
        <line x1="7" y1="15.5" x2="11" y2="15.5" />
        <circle cx="17.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
      </svg>
      <span className={`font-medium ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`} style={{ fontSize: size, letterSpacing: '-0.02em' }}>
        Kivara<span className="text-indigo-500 dark:text-indigo-400"> Lingo</span>
      </span>
    </div>
  );
}
