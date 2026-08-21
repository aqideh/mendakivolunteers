export const recoveryPasswordRequirements =
  "Use 12 to 128 characters with at least one uppercase letter, one lowercase letter, and one number.";

const recoveryPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/;

export function getRecoveryLinkType(
  queryType: string | null,
  hashType: string | null,
): string | null {
  return queryType ?? hashType;
}

export function isValidRecoveryPassword(password: string): boolean {
  return recoveryPasswordPattern.test(password);
}
