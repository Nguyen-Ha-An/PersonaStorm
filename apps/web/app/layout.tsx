import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthHashRedirector } from "@/components/AuthHashRedirector";
import { AuthProvider } from "@/lib/auth";

// Inter is named first in the Tailwind sans stack. It is VENDORED
// (app/fonts/InterVariable.woff2, the official variable font from
// rsms/inter) and served via next/font/local rather than next/font/google:
// the google loader fetches from Google Fonts at BUILD time, which makes
// `next build` fail in offline/airgapped environments (Docker image builds,
// restricted CI) — the local font keeps the build hermetic with identical
// visual output.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
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
