/**
 * The booking confirmation email a customer receives once their court is
 * paid for. Pure functions only (no database, no env) so it can be unit tested
 * and previewed without a running app.
 */

export type BookingConfirmationEmail = {
  customerName: string;
  reference: string;
  courtName: string;
  /** e.g. "Saturday, September 20, 2026" (already in Asia/Manila) */
  dateLabel: string;
  /** e.g. "6:00 PM – 8:00 PM" (already in Asia/Manila) */
  timeLabel: string;
  durationLabel: string;
  amountPaid: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  /** Absolute link to the booking page, which shows the check-in QR code. */
  bookingUrl: string;
  businessName: string;
  businessAddress: string;
  businessPhone?: string;
  businessEmail?: string;
  cancellationPolicy?: string;
};

export function bookingConfirmationSubject(e: Pick<BookingConfirmationEmail, "reference" | "dateLabel">) {
  return `Booking confirmed · ${e.reference} · ${e.dateLabel}`;
}

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
  qrph: "QR Ph",
  card: "Card",
  cash: "Cash",
  paymongo: "PayMongo",
};

export function paymentMethodLabel(method?: string | null): string | null {
  if (!method) return null;
  return METHOD_LABELS[method.toLowerCase()] ?? method.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function rows(e: BookingConfirmationEmail): [string, string][] {
  const list: [string, string][] = [
    ["Booking reference", e.reference],
    ["Court", e.courtName],
    ["Date", e.dateLabel],
    ["Time", e.timeLabel],
    ["Duration", e.durationLabel],
    ["Amount paid", e.amountPaid],
  ];
  const method = paymentMethodLabel(e.paymentMethod);
  if (method) list.push(["Paid with", method]);
  if (e.paymentReference) list.push(["Payment reference", e.paymentReference]);
  return list;
}

export function renderBookingConfirmationHtml(e: BookingConfirmationEmail): string {
  const firstName = e.customerName.trim().split(/\s+/)[0] || "there";
  const detailRows = rows(e)
    .map(
      ([k, v]) => `<tr>
  <td style="padding:8px 16px 8px 0;color:#666;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td>
  <td style="padding:8px 0;font-weight:600;font-size:14px;color:#0A0A0A">${esc(v)}</td>
</tr>`,
    )
    .join("");

  const contact = [e.businessPhone, e.businessEmail].filter(Boolean).map((v) => esc(v!)).join(" · ");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    bookingConfirmationSubject(e),
  )}</title></head>
<body style="margin:0;background:#0A0A0A;padding:24px 12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
  <div style="background:#0A0A0A;padding:22px 28px">
    <span style="color:#6FCF2B;font-size:22px;font-weight:800;letter-spacing:-0.5px">Ez</span><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Pickle</span>
  </div>
  <div style="padding:28px">
    <div style="display:inline-block;background:#EAF8DF;color:#2F7A0B;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.3px">PAID &amp; CONFIRMED</div>
    <h1 style="margin:14px 0 6px;font-size:22px;color:#0A0A0A">You're booked, ${esc(firstName)}!</h1>
    <p style="margin:0;color:#444;font-size:14px;line-height:1.55">
      Thanks for your payment. Your court is reserved — here are your booking details.
    </p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;border-top:1px solid #EEE">${detailRows}</table>
    <div style="margin:26px 0 8px;text-align:center">
      <a href="${esc(e.bookingUrl)}" style="display:inline-block;background:#6FCF2B;color:#0A0A0A;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">View booking &amp; check-in QR</a>
    </div>
    <p style="margin:14px 0 0;color:#666;font-size:13px;line-height:1.55">
      Show your QR code (or quote your booking reference <strong>${esc(e.reference)}</strong>) at the front desk when you arrive. Please come a few minutes early.
    </p>
    ${
      e.cancellationPolicy
        ? `<p style="margin:14px 0 0;color:#888;font-size:12px;line-height:1.5"><strong>Cancellation policy:</strong> ${esc(e.cancellationPolicy)}</p>`
        : ""
    }
  </div>
  <div style="padding:16px 28px;background:#F6F6F6;color:#777;font-size:12px;line-height:1.5">
    ${esc(e.businessName)} · ${esc(e.businessAddress)}${contact ? `<br>${contact}` : ""}<br>
    All times in Philippine Standard Time (Asia/Manila).
  </div>
</div></body></html>`;
}

export function renderBookingConfirmationText(e: BookingConfirmationEmail): string {
  const firstName = e.customerName.trim().split(/\s+/)[0] || "there";
  return [
    `You're booked, ${firstName}!`,
    "",
    "Thanks for your payment. Your court is reserved.",
    "",
    ...rows(e).map(([k, v]) => `${k}: ${v}`),
    "",
    `View your booking and check-in QR code: ${e.bookingUrl}`,
    "",
    `Show your QR code (or quote reference ${e.reference}) at the front desk when you arrive.`,
    ...(e.cancellationPolicy ? ["", `Cancellation policy: ${e.cancellationPolicy}`] : []),
    "",
    `${e.businessName} · ${e.businessAddress}`,
    "All times in Philippine Standard Time (Asia/Manila).",
  ].join("\n");
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
