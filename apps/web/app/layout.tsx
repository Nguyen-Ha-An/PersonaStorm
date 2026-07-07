import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthHashRedirector } from "@/components/AuthHashRedirector";
import { AuthProvider } from "@/lib/auth";

// Inter is named first in the Tailwind sans stack; next/font self-hosts it at
// build time so visitors actually get it (previously it silently fell back to
// system fonts because nothing ever loaded it).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://personastorm.nguyenhaan.id.vn"),
  title: {
    default: "PersonaStorm - The product wind tunnel",
    template: "%s | PersonaStorm",
  },
  description:
    "Run your product concept, ad, pricing, or landing page through a calibrated swarm of synthetic personas before spending money on real research.",
  openGraph: {
    title: "PersonaStorm - The product wind tunnel",
    description:
      "Run your product concept, ad, pricing, or landing page through a calibrated swarm of synthetic personas before spending money on real research.",
    url: "/",
    siteName: "PersonaStorm",
    type: "website",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-[100dvh] bg-storm-950">
        <AuthHashRedirector />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
