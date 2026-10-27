import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { formatManila } from "@/lib/time";
import { bookingQrDataUrl } from "@/lib/qr";
import { BookingConfirmation } from "@/components/booking-confirmation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking confirmed",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/booking/${reference}/confirmation`)}`);
  }

  const booking = await prisma.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      court: true,
      customer: { select: { fullName: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!booking) notFound();

  // Customers may only see their own booking; staff may open any of them.
  if (booking.customerId !== user.id && !STAFF_ROLES.includes(user.role)) notFound();

  const settings = await getSettings();
  const paidPayment = booking.payments.find((p) => p.status === "PAID");
  const paid = Boolean(paidPayment);

  const showQr = ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(booking.status);

  return (
    <BookingConfirmation
      qr={showQr ? await bookingQrDataUrl(booking.id, booking.reference) : null}
      facility={{
        name: settings.businessName,
        address: settings.address,
        phone: settings.phone,
      }}
      booking={{
        reference: booking.reference,
        status: booking.status,
        customerName: booking.customer.fullName,
        courtName: booking.court.name,
        when: formatManila(booking.startAt, "EEEE, d MMMM yyyy"),
        timeRange: `${formatManila(booking.startAt, "h:mm a")} – ${formatManila(booking.endAt, "h:mm a")}`,
        durationMins: booking.durationMins,
        total: booking.total,
        discount: booking.discount,
        paymentReference: paidPayment?.referenceNumber ?? null,
        paymentMethod: paidPayment?.method ?? null,
        paid,
      }}
    />
  );
}
