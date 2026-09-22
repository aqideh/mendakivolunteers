import "@mantine/core/styles.css";

import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Golos_Text } from "next/font/google";

import { keluargaTheme } from "@/lib/ui/theme";

import "./globals.css";
import "./content.css";
import "./phaseone.css";
import "./checkin.css";
import "./admin-events.css";
import "./continuous-attendance.css";
import "./opportunity-image.css";
import "./motion.css";
import "./compact-ui.css";
import "./volunteer-insights.css";
import "./field-roster.css";
import "./brand-theme.css";

const golosText = Golos_Text({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-golos-text",
});

export const metadata: Metadata = {
  title: {
    default: "Keluarga MENDAKI — Volunteer App",
    template: "%s | Keluarga MENDAKI",
  },
  description:
    "Keluarga MENDAKI is MENDAKI's mobile-first volunteer opportunities and event operations app.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#FFD700",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" {...mantineHtmlProps} className={golosText.variable}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body>
        <MantineProvider forceColorScheme="light" theme={keluargaTheme}>
          {children}
        </MantineProvider>
        <Analytics />
      </body>
    </html>
  );
}
