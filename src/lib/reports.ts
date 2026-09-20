import { manilaStartOfDay, manilaEndOfDay, toManilaDateISO } from "@/lib/time";

/**
 * Resolves a named or custom date range (used by every report) into
 * concrete Manila-timezone start/end instants.
 */
export function resolveRange(range: string, fromParam?: string | null, toParam?: string | null) {
  const today = toManilaDateISO(new Date());
  const day = 864e5;

  switch (range) {
    case "today":
      return { from: manilaStartOfDay(today), to: manilaEndOfDay(today) };
    case "yesterday": {
      const y = toManilaDateISO(new Date(Date.now() - day));
      return { from: manilaStartOfDay(y), to: manilaEndOfDay(y) };
    }
    case "this_week": {
      const start = toManilaDateISO(new Date(Date.now() - 6 * day));
      return { from: manilaStartOfDay(start), to: manilaEndOfDay(today) };
    }
    case "last_month": {
      const d = new Date();
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return {
        from: manilaStartOfDay(first.toISOString().slice(0, 10)),
        to: manilaEndOfDay(last.toISOString().slice(0, 10)),
      };
    }
    case "custom":
      return {
        from: manilaStartOfDay(fromParam ?? today),
        to: manilaEndOfDay(toParam ?? today),
      };
    case "this_month":
    default: {
      const first = `${today.slice(0, 8)}01`;
      return { from: manilaStartOfDay(first), to: manilaEndOfDay(today) };
    }
  }
}

/** Renders rows as a downloadable CSV response, BOM-prefixed for Excel. */
export function csv(rows: (string | number)[][], filename: string) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");

  return new Response(`\uFEFF${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
