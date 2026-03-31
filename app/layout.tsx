import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { RiskPreferencesProvider } from "@/components/RiskPreferencesContext";



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
  <html lang="en">
      <body>
        <RiskPreferencesProvider>
          {children}
        </RiskPreferencesProvider>
      </body>
    </html>
  );
}
