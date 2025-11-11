export type Parsed = {
  vendor?: string;
  dateISO?: string;
  total?: number;
};

const datePatterns = [
  /\b(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})\b/, // 31.12.2025 etc.
  /\b(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})\b/, // 2025-12-31
];

const currencyPatterns = [
  /total\s*:\s*([0-9\.,\s]+)\s*(NOK|kr|KR)?/i,
  /(sum|beløp)\s*:\s*([0-9\.,\s]+)\s*(NOK|kr|KR)?/i,
  /\b([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{2})?)\s*(NOK|kr|KR)\b/,
];

export function parseInvoiceText(text: string): Parsed {
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const firstLines = lines.slice(0, 6).join(" ");
  let vendor = firstLines.replace(/\s{2,}/g, " ").slice(0, 80);

  // Date
  let dateISO: string | undefined;
  for (const rx of datePatterns) {
    const m = text.match(rx);
    if (m) {
      if (rx === datePatterns[0]) {
        // dd.mm.yyyy
        const [_, d, mo, y] = m;
        dateISO = `${y}-${mo}-${d}`;
      } else {
        // yyyy-mm-dd
        const [_, y, mo, d] = m;
        dateISO = `${y}-${mo}-${d}`;
      }
      break;
    }
  }

  // Amount
  let total: number | undefined;
  for (const rx of currencyPatterns) {
    const m = text.match(rx);
    if (!m) continue;
    const raw = (m[1] ?? m[2])?.replace(/\s|\./g, "").replace(",", "."); // handle 12 345,67
    const val = Number(raw);
    if (Number.isFinite(val)) { total = val; break; }
  }

  return { vendor, dateISO, total };
}
