import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.arjunglasshouse.com"),
  title: {
    default: "Arjun Glass House | Glass, Mirrors & Hardware",
    template: "%s | Arjun Glass House",
  },
  description: "Shop glass, mirrors, custom sizes and architectural hardware from Arjun Glass House.",
  applicationName: "Arjun Glass House",
  manifest: "/manifest.webmanifest",
  keywords: [
    "Arjun Glass House",
    "glass shop",
    "toughened glass",
    "mirrors",
    "fluted glass",
    "glass hardware",
    "custom glass",
  ],
  authors: [{ name: "Arjun Glass House" }],
  creator: "Arjun Glass House",
  publisher: "Arjun Glass House",
  alternates: {
    canonical: "/shop",
  },
  openGraph: {
    type: "website",
    siteName: "Arjun Glass House",
    title: "Arjun Glass House | Glass, Mirrors & Hardware",
    description: "Choose glass, mirrors, custom sizes and architectural hardware online.",
    url: "/shop",
    images: [{
      url: "/shop-products/photos/shower-enclosure.png",
      width: 1200,
      height: 900,
      alt: "Arjun Glass House glass and hardware showcase",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arjun Glass House | Glass, Mirrors & Hardware",
    description: "Choose glass, mirrors, custom sizes and architectural hardware online.",
    images: ["/shop-products/photos/shower-enclosure.png"],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
