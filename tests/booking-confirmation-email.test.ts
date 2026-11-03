import { describe, expect, it } from "vitest";
import {
  bookingConfirmationSubject,
  paymentMethodLabel,
  renderBookingConfirmationHtml,
  renderBookingConfirmationText,
  type BookingConfirmationEmail,
} from "@/lib/email-booking-confirmation";

const email: BookingConfirmationEmail = {
  customerName: "Ana Cruz",
  reference: "EZP-ABC123",
  courtName: "Court 1",
  dateLabel: "Saturday, September 20, 2026",
  timeLabel: "6:00 PM – 8:00 PM",
  durationLabel: "2 hours",
  amountPaid: "₱1,200",
  paymentMethod: "gcash",
  paymentReference: "PAY-XYZ",
  bookingUrl: "https://ezpickle.ph/booking/EZP-ABC123/confirmation",
  businessName: "EzPickle",
  businessAddress: "Quezon City",
  cancellationPolicy: "Cancel up to 4 hours before.",
};

describe("booking confirmation email", () => {
  it("includes every booking detail and a link to the booking", () => {
    const html = renderBookingConfirmationHtml(email);
    for (const v of ["Ana", "EZP-ABC123", "Court 1", "Saturday, September 20, 2026", "6:00 PM – 8:00 PM", "₱1,200", "GCash", "PAY-XYZ", email.bookingUrl]) {
      expect(html).toContain(v);
    }
    const text = renderBookingConfirmationText(email);
    expect(text).toContain("Booking reference: EZP-ABC123");
    expect(text).toContain(email.bookingUrl);
  });

  it("escapes customer-controlled values", () => {
    const html = renderBookingConfirmationHtml({ ...email, customerName: "<script>x</script>" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("builds a useful subject and readable payment methods", () => {
    expect(bookingConfirmationSubject(email)).toBe("Booking confirmed · EZP-ABC123 · Saturday, September 20, 2026");
    expect(paymentMethodLabel("paymaya")).toBe("Maya");
    expect(paymentMethodLabel("bank_transfer")).toBe("Bank transfer");
    expect(paymentMethodLabel(null)).toBeNull();
  });
});
