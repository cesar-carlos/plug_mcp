const OFFSET_RE = /(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i;

const normalizeOffset = (raw: string): string => {
  if (/^(GMT|UTC)$/i.test(raw.trim())) {
    return "Z";
  }
  const match = OFFSET_RE.exec(raw);
  if (!match?.[1] || !match[2]) {
    return "Z";
  }
  const hh = match[2].padStart(2, "0");
  const mm = (match[3] ?? "00").padStart(2, "0");
  return `${match[1]}${hh}:${mm}`;
};

const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((item) => item.type === type)?.value ?? "";

export const formatAsOf = (
  date: Date,
  timezone: string | null,
): { asOf: string; aviso?: string } => {
  const tz = timezone?.trim() ?? "";
  if (!tz) {
    return { asOf: date.toISOString() };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const offset = normalizeOffset(part(parts, "timeZoneName"));
    const asOf = `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}T${part(parts, "hour")}:${part(parts, "minute")}:${part(parts, "second")}${offset}[${tz}]`;
    return { asOf };
  } catch {
    return {
      asOf: date.toISOString(),
      aviso: `Timezone ${tz} inválido; asOf em UTC.`,
    };
  }
};
