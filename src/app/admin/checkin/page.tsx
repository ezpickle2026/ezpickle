"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Badge, Button, Card, Field, PageHeader, inputClass, fmtDate, fmtTime } from "@/components/admin/ui";
import { peso } from "@/lib/utils";

type Result = {
  booking: {
    reference: string;
    status: string;
    startAt: string;
    endAt: string;
    total: number;
    court: { name: string };
    customer: { fullName: string; email: string; mobile: string | null };
  };
  checkedIn?: boolean;
  alreadyCheckedIn?: boolean;
  paid: boolean;
  checkedInAt?: string | null;
};

export default function AdminCheckinPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(token: string) {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<Result>("/api/admin/checkin", { body: { token: token.trim() } }));
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify that booking.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Check-in"
        description="Scan the customer's QR code with a handheld scanner, or type their booking reference."
      />

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[220px] flex-1">
            <Field label="Booking code" hint="Most USB/Bluetooth scanners type into this field and press Enter.">
              <input
                ref={inputRef}
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="EZP-XXXXXX or scanned token"
                autoComplete="off"
              />
            </Field>
          </div>
          <Button type="submit" loading={busy}>
            Verify
          </Button>
          <Button type="button" variant="secondary" onClick={() => setScanning((s) => !s)}>
            <Camera size={16} aria-hidden />
            {scanning ? "Stop camera" : "Use camera"}
          </Button>
        </form>

        {scanning && <CameraScanner onToken={(token) => void submit(token)} />}
      </Card>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4"
          >
            <XCircle size={20} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
            <div>
              <p className="font-semibold text-red-200">Invalid booking</p>
              <p className="mt-0.5 text-sm text-red-200/70">{error}</p>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.div
            key={result.booking.reference}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5"
          >
            <Card className="border-pickle-500/40">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-pickle-400" aria-hidden />
                <div className="flex-1">
                  <p className="text-lg font-semibold text-white">
                    {result.alreadyCheckedIn ? "Already checked in" : "Checked in"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs tracking-wider text-white/40">
                    {result.booking.reference}
                  </p>
                </div>
                <Badge tone={result.paid ? "green" : "amber"}>
                  {result.paid ? "paid" : "unpaid"}
                </Badge>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Customer", result.booking.customer.fullName],
                  ["Contact", result.booking.customer.mobile ?? result.booking.customer.email],
                  ["Court", result.booking.court.name],
                  ["Date", fmtDate(result.booking.startAt, { weekday: "long" })],
                  [
                    "Time",
                    `${fmtTime(result.booking.startAt)} – ${fmtTime(result.booking.endAt)}`,
                  ],
                  ["Amount", peso(result.booking.total)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-white/35">{label}</dt>
                    <dd className="mt-0.5 text-white/85">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Camera scanning uses the browser's built-in BarcodeDetector where available.
 * Where it isn't (Safari, older Android), staff fall back to the text field —
 * no extra dependency, and the desk scanner path always works.
 */
function CameraScanner({ onToken }: { onToken: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector })
      .BarcodeDetector;

    if (!Ctor) {
      setMessage("This browser can't scan with the camera. Use a handheld scanner or type the code.");
      return;
    }

    const detector = new Ctor({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setMessage("We couldn't access the camera. Check browser permissions.");
        return;
      }

      const tick = async () => {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            onToken(codes[0].rawValue);
            stopped = true;
            return;
          }
        } catch {
          /* frame not ready */
        }
        raf = requestAnimationFrame(() => void tick());
      };
      raf = requestAnimationFrame(() => void tick());
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onToken]);

  return (
    <div className="mt-4">
      {message ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{message}</p>
      ) : (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-xl bg-black object-cover"
          muted
          playsInline
        />
      )}
    </div>
  );
}
