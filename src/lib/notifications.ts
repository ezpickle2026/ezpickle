import "server-only";
import { prisma } from "./prisma";
import { env } from "./env";

export type TemplateKey =
  | "booking_created"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "payment_failed"
  | "openplay_registered"
  | "openplay_stacked"
  | "waitlist_promoted";

const SUBJECTS: Record<TemplateKey, string> = {
  booking_created: "Your EzPickle court is on hold",
  booking_confirmed: "Booking confirmed — see you on court",
  booking_cancelled: "Your EzPickle booking was cancelled",
  booking_rescheduled: "Your EzPickle booking was moved",
  payment_failed: "We couldn't complete your payment",
  openplay_registered: "You're in for Open Play",
  openplay_stacked: "Your Open Play court assignment",
  waitlist_promoted: "A spot opened up — claim it",
};

/**
 * Notifications are persisted first, then delivered. If the mail provider is
 * down the record survives and can be retried; nothing is lost in flight.
 */
export async function notify(params: {
  userId?: string | null;
  to: string;
  template: TemplateKey;
  payload: Record<string, unknown>;
}) {
  const record = await prisma.notification.create({
    data: {
      userId: params.userId ?? null,
      channel: "EMAIL",
      template: params.template,
      to: params.to,
      subject: SUBJECTS[params.template],
      payload: params.payload as never,
    },
  });

  if (!env.RESEND_API_KEY) return record; // queued; no provider configured

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: params.to,
        subject: SUBJECTS[params.template],
        html: renderTemplate(params.template, params.payload),
      }),
    });
    if (!res.ok) throw new Error(`mail provider responded ${res.status}`);

    return prisma.notification.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    console.error("[notify] delivery failed", error);
    return prisma.notification.update({
      where: { id: record.id },
      data: { status: "FAILED", error: String(error).slice(0, 500) },
    });
  }
}

function renderTemplate(template: TemplateKey, payload: Record<string, unknown>): string {
  const rows = Object.entries(payload)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#666;font-size:13px">${escapeHtml(
          label(k),
        )}</td><td style="padding:6px 0;font-weight:600;font-size:14px">${escapeHtml(
          String(v),
        )}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#0A0A0A;padding:32px;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
  <div style="background:#0A0A0A;padding:22px 28px">
    <span style="color:#6FCF2B;font-size:22px;font-weight:800;letter-spacing:-0.5px">Ez</span><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Pickle</span>
  </div>
  <div style="padding:28px">
    <h1 style="margin:0 0 6px;font-size:20px;color:#0A0A0A">${escapeHtml(SUBJECTS[template])}</h1>
    <table style="width:100%;border-collapse:collapse;margin-top:18px">${rows}</table>
  </div>
  <div style="padding:16px 28px;background:#F6F6F6;color:#777;font-size:12px">
    EzPickle · Quezon City · All times in Philippine Standard Time (Asia/Manila)
  </div>
</div></body></html>`;
}

function label(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
