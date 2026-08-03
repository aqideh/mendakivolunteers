const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const LEADING_CONTROL_WHITESPACE = /^[\u0000-\u0020]+/;

export function neutralizeSpreadsheetFormula(value: string): string {
  const candidate = value.replace(LEADING_CONTROL_WHITESPACE, "");
  return FORMULA_PREFIX.test(candidate) ? `'${value}` : value;
}

export function csvCell(value: string | null | undefined): string {
  const text = neutralizeSpreadsheetFormula(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
