import "@mantine/core/styles.css";

import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import type { Metadata, Viewport } from "next";

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
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body>
        <MantineProvider forceColorScheme="light" theme={keluargaTheme}>
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
