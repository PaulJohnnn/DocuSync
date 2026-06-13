import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <div style={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
        }}>
          {children}
        </div>
      </body>
    </html>
  );
}
