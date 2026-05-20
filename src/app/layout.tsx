import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DocuSync",
  description: "Offline-first document collaboration platform",
};

import { ThemeProvider } from "../components/ThemeProvider";
import { SyncProvider } from "../context/SyncContext";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <SyncProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  color: '#f4f4f5',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '13px',
                },
              }}
              richColors
            />
          </SyncProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
