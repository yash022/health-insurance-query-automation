import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Care.fi — Patient Locker',
  description: 'A clearer path from insurer queries to patient care.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
