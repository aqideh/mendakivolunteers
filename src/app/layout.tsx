import type { Metadata, Viewport } from "next";

import "./globals.css";
import "./content.css";
import "./phaseone.css";
import "./opportunity-image.css";

export const metadata: Metadata = {
  title: {
    default: "RELA! MENDAKI Volunteer App",
    template: "%s | RELA! MENDAKI Volunteer App",
  },
  description:
    "Mobile-first MENDAKI volunteer opportunities and event operations portal.",
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
