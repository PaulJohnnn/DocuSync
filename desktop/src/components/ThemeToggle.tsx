"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export function ThemeToggle() {
    const [mounted, setMounted] = React.useState(false);
    const { setTheme, resolvedTheme } = useTheme();

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-14 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800/80 animate-pulse border border-transparent mx-2" />;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`
                relative flex items-center w-14 h-8 rounded-full p-1 mx-2 focus:outline-none transition-colors duration-300
                ${isDark ? 'bg-zinc-800/80 border border-white/10 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]' : 'bg-zinc-200 border border-black/5 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1)]'}
            `}
            aria-label="Toggle theme switch"
            title="Toggle Dark Mode"
        >
            <motion.div
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`
                    flex items-center justify-center w-6 h-6 rounded-full shadow-md
                    ${isDark ? 'bg-zinc-950 border border-white/5' : 'bg-white border border-black/5'}
                `}
                style={{ marginLeft: isDark ? 'auto' : '0' }}
            >
                <motion.div
                    initial={false}
                    animate={{ rotate: isDark ? 360 : 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                    {isDark ? (
                        <Moon className="w-3.5 h-3.5 text-zinc-400" strokeWidth={2.5} />
                    ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.5} />
                    )}
                </motion.div>
            </motion.div>
        </motion.button>
    );
}
