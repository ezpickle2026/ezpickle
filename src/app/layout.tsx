import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { BrandProvider } from "@/components/brand";
import { getBrand } from "@/lib/settings";

// Branding comes from the database, so pages are rendered per request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { businessName: name, logoUrl } = await getBrand();
  // Browser-tab icon: the admin's uploaded logo, or the built-in EzPickle mark.
  const customLogo = logoUrl !== "" && logoUrl !== "/logo.png";
  const icons: Metadata["icons"] = customLogo
    ? { icon: logoUrl, apple: logoUrl }
    : {
        icon: [
          { url: "/favicon.ico", sizes: "any" },
          { url: "/icon.png", type: "image/png", sizes: "512x512" },
        ],
        apple: "/apple-icon.png",
      };
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: {
      default: `${name} — Pickleball Court Booking`,
      template: `%s · ${name}`,
    },
    description:
      "Book a pickleball court in seconds, join Open Play sessions, and pay online with GCash, Maya or card.",
    keywords: ["pickleball", "pickleball court booking", "open play pickleball", name],
    openGraph: {
      type: "website",
      siteName: name,
      title: `${name} — Play Easy. Play More.`,
      description: "Reserve a court online in under a minute. Open Play every week.",
      locale: "en_PH",
    },
    twitter: { card: "summary_large_image", title: name, description: "Pickleball, booked easy." },
    icons,
    robots: { index: true, follow: true },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <html lang="en-PH" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-white antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pickle-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>
        <BrandProvider brand={brand}>
          <ToastProvider>{children}</ToastProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
