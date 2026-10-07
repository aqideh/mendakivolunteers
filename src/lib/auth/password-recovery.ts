export const recoveryPasswordRequirements =
  "Use 12 to 128 characters with at least one uppercase letter, one lowercase letter, one number, and one symbol (for example !, @, #, $, % or &).";

const recoveryPasswordSymbols = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./\`~";

export function getRecoveryLinkType(
  queryType: string | null,
  hashType: string | null,
): string | null {
  return queryType ?? hashType;
}

export function isValidRecoveryPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    [...password].some((character) => recoveryPasswordSymbols.includes(character))
  );
}
