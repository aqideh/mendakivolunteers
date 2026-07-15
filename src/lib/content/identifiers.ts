const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function readRequiredUuid(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== "string" || !isUuid(value)) {
    throw new Error(`Invalid ${name} identifier.`);
  }

  return value;
}
