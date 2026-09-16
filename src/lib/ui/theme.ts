import { createTheme, type MantineColorsTuple } from "@mantine/core";

const keluarga: MantineColorsTuple = [
  "#edf4f8",
  "#d9e7ef",
  "#b8d1de",
  "#92b8cb",
  "#70a2ba",
  "#5893ae",
  "#4688a8",
  "#327694",
  "#245f78",
  "#12324a",
];

export const keluargaTheme = createTheme({
  primaryColor: "keluarga",
  primaryShade: 9,
  colors: {
    keluarga,
  },
  defaultRadius: "md",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: "800",
  },
  focusRing: "auto",
});
