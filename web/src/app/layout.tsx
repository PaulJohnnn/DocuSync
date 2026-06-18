import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: "DocuSync — Web Edition",
  description: "Hybrid P2P File Synchronization Engine — Web Client",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <ThemeProvider>
          <div style={{
            display: 'flex',
            height: '100vh',
            overflow: 'hidden',
          }}>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
