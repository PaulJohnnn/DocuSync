import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: "DocuSync — Web Edition",
  description: "Hybrid P2P File Synchronization Engine — Web Client",
};

import ClientLayoutWrapper from '@/components/ClientLayoutWrapper';
import { WebSyncProvider } from '@/context/WebSyncContext';
import { SyncStateProvider } from '@/context/SyncStateContext';
import { Toaster } from 'sonner';
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className={inter.className} style={{ background: 'var(--bg)', color: 'var(--t1)' }}>
        <ThemeProvider>
          <SyncStateProvider>
            <WebSyncProvider>
              <ClientLayoutWrapper>
                {children}
              </ClientLayoutWrapper>
              <Toaster position="bottom-right" richColors />
            </WebSyncProvider>
          </SyncStateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
