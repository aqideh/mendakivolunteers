import { createTheme, type MantineColorsTuple } from "@mantine/core";

const keluargaYellow: MantineColorsTuple = [
  "#fffbea",
  "#fff5bf",
  "#ffed80",
  "#ffe540",
  "#ffdc1f",
  "#FFD700",
  "#d6b500",
  "#ad9200",
  "#846f00",
  "#5c4d00",
];

const keluargaBlue: MantineColorsTuple = [
  "#eafafd",
  "#d1f3f7",
  "#a7e6ed",
  "#7bd8e2",
  "#55cad6",
  "#38bfce",
  "#26B5C6",
  "#168b98",
  "#106d78",
  "#0b5058",
];

export const keluargaTheme = createTheme({
  primaryColor: "keluargaYellow",
  primaryShade: 5,
  colors: {
    keluargaYellow,
    keluargaBlue,
  },
  black: "#373A36",
  white: "#FFFFFF",
  defaultRadius: "md",
  fontFamily:
    'var(--font-golos-text), "Golos Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'var(--font-golos-text), "Golos Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: "700",
  },
  autoContrast: true,
  focusRing: "auto",
});
