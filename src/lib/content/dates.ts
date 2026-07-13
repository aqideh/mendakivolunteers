const singaporeTimeZone = "Asia/Singapore";
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocalParts(value: string) {
  const match = localDateTimePattern.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return {
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText: secondText ?? "00",
  };
}

export function isValidSingaporeDateTimeLocal(value: string): boolean {
  return parseLocalParts(value) !== null;
}

export function singaporeDateTimeLocalToIso(value: string): string {
  const parts = parseLocalParts(value);
  if (!parts) {
    throw new Error("Invalid Singapore local date and time");
  }

  const localValue = `${parts.yearText}-${parts.monthText}-${parts.dayText}T${parts.hourText}:${parts.minuteText}:${parts.secondText}+08:00`;
  return new Date(localValue).toISOString();
}

export function toSingaporeDateTimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: singaporeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function formatSingaporeDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-SG", {
    timeZone: singaporeTimeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatSingaporeDate(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-SG", {
    timeZone: singaporeTimeZone,
    dateStyle: "long",
  }).format(date);
}
