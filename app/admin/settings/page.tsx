"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
  minutesToLabel,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";

type Settings = {
  businessName: string;
  logoUrl: string;
  email: string;
  phone: string;
  address: string;
  openingMin: number;
  closingMin: number;
  bookingIntervalMins: number;
  minBookingMins: number;
  maxBookingMins: number;
  maxAdvanceDays: number;
  minCancelNoticeMins: number;
  holdMinutes: number;
  bufferMins: number;
  openPlayHoldMinutes: number;
  waitlistOfferMinutes: number;
  cancellationPolicy: string;
};

const HALF_HOURS = Array.from({ length: 49 }, (_, i) => i * 30);

export default function AdminSettingsPage() {
  const { data, loading } = useResource<{ settings: Settings }>("/api/admin/settings");
  const { run, busy } = useMutate();
  const [form, setForm] = useState<Settings | null>(null);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (loading || !form) return <Skeleton className="h-96 w-full" />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm({ ...form, [key]: value });

  const numberField = (
    label: string,
    key: keyof Settings,
    hint?: string,
    min = 0,
  ) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        className={inputClass}
        value={form[key] as number}
        onChange={(e) => set(key, Number(e.target.value) as never)}
      />
    </Field>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Settings"
        description="Business details and the booking rules the whole system reads from."
        actions={
          <Button
            loading={busy}
            onClick={() =>
              run(() => api("/api/admin/settings", { method: "PATCH", body: form }), {
                success: "Settings saved.",
              })
            }
          >
            Save changes
          </Button>
        }
      />

      <div className="space-y-5">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Business details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input
                className={inputClass}
                value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)}
              />
            </Field>
            <Field label="Logo URL">
              <input
                className={inputClass}
                value={form.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)}
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
            </div>
          </div>
          <p className="mt-4 text-xs text-white/35">
            Timezone is fixed to Asia/Manila and currency to PHP — both are baked into how bookings
            and money are stored, so they are deliberately not editable here.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Opening hours
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Opens</span>
              <select
                className={`${selectClass} w-full`}
                value={form.openingMin}
                onChange={(e) => set("openingMin", Number(e.target.value))}
              >
                {HALF_HOURS.slice(0, 48).map((m) => (
                  <option key={m} value={m}>
                    {minutesToLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-[13px] font-medium text-white/70">Closes</span>
              <select
                className={`${selectClass} w-full`}
                value={form.closingMin}
                onChange={(e) => set("closingMin", Number(e.target.value))}
              >
                {HALF_HOURS.slice(1).map((m) => (
                  <option key={m} value={m}>
                    {m === 1440 ? "12:00 AM (midnight)" : minutesToLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Booking rules
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {numberField("Slot interval (mins)", "bookingIntervalMins", "Grid granularity.", 15)}
            {numberField("Minimum booking (mins)", "minBookingMins", undefined, 15)}
            {numberField("Maximum booking (mins)", "maxBookingMins", undefined, 30)}
            {numberField("Advance window (days)", "maxAdvanceDays", "How far ahead customers can book.", 1)}
            {numberField("Buffer between bookings (mins)", "bufferMins", "Turnaround gap on each court.")}
            {numberField(
              "Cancellation notice (mins)",
              "minCancelNoticeMins",
              "Free cancellation cut-off.",
            )}
            {numberField("Payment hold (mins)", "holdMinutes", "How long a court slot is held.", 3)}
            {numberField("Open Play hold (mins)", "openPlayHoldMinutes", undefined, 3)}
            {numberField("Waitlist offer window (mins)", "waitlistOfferMinutes", undefined, 5)}
          </div>
          <p className="mt-4 text-xs text-white/35">
            These values drive quotes, the availability grid, the hold sweeper and the customer-facing
            copy. Nothing about pricing lives here — that is in Courts → Pricing rules.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Cancellation policy
          </h2>
          <textarea
            className={`${inputClass} min-h-28`}
            value={form.cancellationPolicy}
            onChange={(e) => set("cancellationPolicy", e.target.value)}
            aria-label="Cancellation policy"
          />
          <p className="mt-2 text-xs text-white/35">
            Shown to customers before they confirm a cancellation and in booking emails.
          </p>
        </Card>
      </div>
    </div>
  );
}
