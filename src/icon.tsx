import React from 'react';

interface IconProps {
  className?: string;
}

export function DeepSeekIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-2.14c-1.72-.45-3-2-3-3.86h2c0 1.1.9 2 2 2s2-.9 2-2c0-1.1-.9-2-2-2-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4h-2c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2c2.21 0 4 1.79 4 4 0 1.86-1.28 3.41-3 3.86v2.14h-2z" />
    </svg>
  );
}
