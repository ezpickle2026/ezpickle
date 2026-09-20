import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "EzPickle — Pickleball Court Booking in Metro Manila",
    template: "%s · EzPickle",
  },
  description:
    "Book a pickleball court in seconds, join Open Play sessions, and pay online with GCash, Maya or card. Indoor and outdoor courts in Quezon City.",
  keywords: [
    "pickleball",
    "pickleball court booking",
    "pickleball Quezon City",
    "open play pickleball",
    "EzPickle",
  ],
  openGraph: {
    type: "website",
    siteName: "EzPickle",
    title: "EzPickle — Play Easy. Play More.",
    description: "Reserve a court online in under a minute. Open Play every week.",
    locale: "en_PH",
  },
  twitter: { card: "summary_large_image", title: "EzPickle", description: "Pickleball, booked easy." },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-white antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pickle-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
