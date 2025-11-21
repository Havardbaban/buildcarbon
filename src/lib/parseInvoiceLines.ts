export type ParsedLine = {
  lineNumber: number;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  category: string | null;
  esgScope: 1 | 2 | 3 | null;
  co2Kg: number | null;
};

type CategoryRule = {
  keywords: string[];
  category: string;
  esgScope: 1 | 2 | 3;
  co2PerUnit: number;
  unit: string;
};

const CATEGORY_RULES: CategoryRule[] = [
  { keywords: ["diesel"], category: "fuel_diesel", esgScope: 1, co2PerUnit: 2.68, unit: "liter" },
  { keywords: ["bensin", "petrol", "gasoline"], category: "fuel_petrol", esgScope: 1, co2PerUnit: 2.31, unit: "liter" },
  { keywords: ["natural gas", "gass", "naturgass"], category: "fuel_gas", esgScope: 1, co2PerUnit: 2.0, unit: "m3" },
  { keywords: ["strøm", "strom", "electricity", "power", "kwh"], category: "electricity", esgScope: 2, co2PerUnit: 0.028, unit: "kwh" },
  { keywords: ["fjernvarme", "district heat", "heating"], category: "heating", esgScope: 2, co2PerUnit: 0.05, unit: "kwh" },
  { keywords: ["flight", "fly", "airline"], category: "travel_flight", esgScope: 3, co2PerUnit: 0.255, unit: "km" },
  { keywords: ["train", "tog", "railway"], category: "travel_train", esgScope: 3, co2PerUnit: 0.041, unit: "km" },
  { keywords: ["taxi", "uber", "drosje"], category: "travel_taxi", esgScope: 3, co2PerUnit: 0.192, unit: "km" },
  { keywords: ["hotel", "hotell"], category: "travel_hotel", esgScope: 3, co2PerUnit: 5.5, unit: "night" },
  { keywords: ["waste", "avfall"], category: "waste", esgScope: 3, co2PerUnit: 0.45, unit: "kg" },
];

function classifyLine(description: string): Pick<ParsedLine, "category" | "esgScope" | "co2Kg"> & { rule: CategoryRule | null } {
  const text = description.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return {
        category: rule.category,
        esgScope: rule.esgScope,
        co2Kg: null,
        rule,
      };
    }
  }

  return { category: null, esgScope: null, co2Kg: null, rule: null };
}

function extractQuantityFromLine(text: string, rule: CategoryRule | null): number | null {
  if (!rule) return null;

  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*(?:kwh|liter|l|kg|km|m3|night)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:stk|st|pcs|pc)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(",", "."));
    }
  }

  return null;
}

function extractAmountFromLine(text: string): number | null {
  const amountPattern = /(?:kr|nok)?\s*(\d+(?:\s?\d{3})*(?:[.,]\d{2})?)\s*(?:kr|nok)?/i;
  const match = text.match(amountPattern);

  if (match) {
    const numStr = match[1].replace(/\s/g, "").replace(",", ".");
    return parseFloat(numStr);
  }

  return null;
}

export function parseInvoiceLines(ocrText: string): ParsedLine[] {
  const lines = ocrText.split("\n").filter(line => line.trim().length > 0);
  const parsedLines: ParsedLine[] = [];

  let lineNumber = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length < 5) continue;

    const { category, esgScope, rule } = classifyLine(trimmed);

    if (category) {
      const quantity = extractQuantityFromLine(trimmed, rule);
      const amount = extractAmountFromLine(trimmed);

      let co2Kg: number | null = null;
      if (quantity && rule) {
        co2Kg = quantity * rule.co2PerUnit;
      }

      parsedLines.push({
        lineNumber,
        description: trimmed,
        quantity,
        unitPrice: amount && quantity ? amount / quantity : null,
        amount,
        category,
        esgScope,
        co2Kg,
      });

      lineNumber++;
    }
  }

  return parsedLines;
}
