"use client";

import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
    const [isDark, setIsDark] = useState(false);

    return (
        <button
            onClick={() => setIsDark(!isDark)}
            className={`
        relative inline-flex items-center h-8 rounded-full w-14 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
        ${isDark ? 'bg-slate-700' : 'bg-slate-300'}
      `}
            aria-label="Toggle Dark Mode"
        >
            <span
                className={`
          inline-block w-6 h-6 transform bg-white rounded-full transition-transform duration-300 ease-in-out flex items-center justify-center shadow-md
          ${isDark ? 'translate-x-7' : 'translate-x-1'}
        `}
            >
                {isDark ? (
                    <Moon className="w-4 h-4 text-slate-700 transition-all duration-300" />
                ) : (
                    <Sun className="w-4 h-4 text-amber-500 transition-all duration-300" />
                )}
            </span>
        </button>
    );
}
