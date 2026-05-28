import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import ThemeProvider from "@/components/ThemeProvider";

// Brand fonts: Cabinet Grotesk (display) + Satoshi (body) ship via Fontshare CDN
// via an `@import` in globals.css (loading them through manual <link> tags in
// <head> caused Next.js hydration mismatches when the framework reordered head
// children). Local-font wiring through `next/font/local` is a future improvement
// once the woff2 files are uploaded to public/fonts/. Geist Mono stays via
// next/font/google for tabular numerics.
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Attraction by Video",
  description: "YouTube channel audit platform and link tracker",
  icons: {
    icon: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('atbv-theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
