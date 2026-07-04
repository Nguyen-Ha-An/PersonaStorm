import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "PersonaStorm — The product wind tunnel",
  description:
    "Run your product concept, ad, pricing, or landing page through a calibrated swarm of synthetic personas before spending money on real research.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-storm-950">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
