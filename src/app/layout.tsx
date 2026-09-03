import type { Metadata, Viewport } from "next";

import "./globals.css";
import "./content.css";
import "./phaseone.css";
import "./checkin.css";
import "./opportunity-image.css";
import "./motion.css";

export const metadata: Metadata = {
  title: {
    default: "KELUARGA — MENDAKI Volunteer App",
    template: "%s | KELUARGA",
  },
  description:
    "KELUARGA is MENDAKI's mobile-first volunteer opportunities and event operations app.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#12324a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
