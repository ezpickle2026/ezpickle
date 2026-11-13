"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Circle, Square, SwitchCamera } from "lucide-react";
import { csrfToken } from "@/lib/client";
import { Badge, Button, Card, Field, PageHeader, selectClass, useResource } from "@/components/admin/ui";

type Camera = { id: string; name: string; court: { name: string } };
type Upload = { id: number; startAt: Date; endAt: Date; size: number; state: "waiting" | "uploading" | "done" | "failed"; error?: string };

const CLIP_OPTIONS = [1, 5, 10];
const FRAME_MS = 1000;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(d);

/**
 * Turns this phone into a Pickle Cam: open on the phone at the court, press
 * Start. It streams a live picture and uploads a clip every few minutes.
 */
export default function PhoneCameraPage() {
  const { id } = useParams<{ id: string }>();
  const cameras = useResource<{ cameras: Camera[] }>("/api/admin/cameras");
  const camera = cameras.data?.cameras.find((c) => c.id === id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const runningRef = useRef(false);
  const clipTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frameTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [clipMins, setClipMins] = useState(5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [frames, setFrames] = useState(0);
  const [clipStart, setClipStart] = useState<Date | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const patchUpload = (uid: number, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.id === uid ? { ...u, ...patch } : u)));

  /** Uploads run one at a time so a slow connection doesn't pile up. */
  const enqueueUpload = useCallback(
    (blob: Blob, startAt: Date, endAt: Date) => {
      const uid = Date.now();
      setUploads((list) => [{ id: uid, startAt, endAt, size: blob.size, state: "waiting" as const }, ...list].slice(0, 20));
      queue.current = queue.current.then(async () => {
        patchUpload(uid, { state: "uploading" });
        try {
          const form = new FormData();
          form.append("file", blob, blob.type.includes("mp4") ? "clip.mp4" : "clip.webm");
          form.append("startAt", startAt.toISOString());
          form.append("endAt", endAt.toISOString());
          const res = await fetch(`/api/admin/cameras/${id}/phone/clip`, {
            method: "POST",
            headers: { "x-csrf-token": csrfToken() },
            body: form,
            credentials: "same-origin",
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error?.message ?? `Upload failed (${res.status})`);
          patchUpload(uid, { state: "done" });
        } catch (e) {
          patchUpload(uid, { state: "failed", error: e instanceof Error ? e.message : "Upload failed" });
        }
      });
    },
    [id],
  );

  const startClip = useCallback(() => {
    const stream = streamRef.current;
    const mimeType = pickMimeType();
    if (!stream || mimeType === null) return;
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_500_000 });
    const chunks: Blob[] = [];
    const startedAt = new Date();
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/mp4" });
      if (blob.size > 0) enqueueUpload(blob, startedAt, new Date());
      if (runningRef.current) startClip();
      else {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setClipStart(startedAt);
    clipTimer.current = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), clipMins * 60_000);
  }, [clipMins, enqueueUpload]);

  /** Sends a small JPEG of the current picture for the live view. */
  const startFrames = useCallback(() => {
    const canvas = document.createElement("canvas");
    let busy = false;
    frameTimer.current = setInterval(() => {
      const video = videoRef.current;
      if (busy || !video || video.videoWidth === 0) return;
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      busy = true;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            busy = false;
            return;
          }
          fetch(`/api/admin/cameras/${id}/phone/frame`, {
            method: "POST",
            headers: { "x-csrf-token": csrfToken(), "Content-Type": "image/jpeg" },
            body: blob,
            credentials: "same-origin",
          })
            .then((r) => r.ok && setFrames((n) => n + 1))
            .catch(() => {})
            .finally(() => (busy = false));
        },
        "image/jpeg",
        0.6,
      );
    }, FRAME_MS);
  }, [id]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't use the camera. Open the site over https:// in Safari or Chrome.");
      return;
    }
    if (pickMimeType() === null) {
      setError("This browser can't record video. Update iOS (14.3 or newer) or use Chrome.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* screen may still sleep; the page says to keep it open */
      }
      runningRef.current = true;
      setRunning(true);
      startClip();
      startFrames();
    } catch {
      setError("Camera permission was denied. Allow camera access for this site in Settings, then try again.");
    }
  }

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setClipStart(null);
    clearTimeout(clipTimer.current);
    clearInterval(frameTimer.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    else streamRef.current?.getTracks().forEach((t) => t.stop());
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    void fetch(`/api/admin/cameras/${id}/phone/frame`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken() },
      credentials: "same-origin",
    }).catch(() => {});
  }, [id]);

  // Leaving the page stops the camera.
  useEffect(
    () => () => {
      if (runningRef.current) stop();
    },
    [stop],
  );

  const elapsed = clipStart ? Math.floor((Date.now() - clipStart.getTime()) / 1000) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/pickle-cam" className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
        <ArrowLeft size={15} aria-hidden />
        Pickle Cam
      </Link>
      <PageHeader
        title="Phone camera"
        description={camera ? `${camera.court.name} · ${camera.name}` : "Use this phone as the court camera."}
      />

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
        <video ref={videoRef} muted playsInline className="absolute inset-0 size-full object-contain" />
        {!running && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/45">Camera is off</div>
        )}
        {running && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
            <Circle size={8} fill="currentColor" aria-hidden />
            REC {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Camera">
          <select
            className={selectClass}
            value={facing}
            disabled={running}
            onChange={(e) => setFacing(e.target.value as "environment" | "user")}
          >
            <option value="environment">Back camera</option>
            <option value="user">Front camera</option>
          </select>
        </Field>
        <Field label="Clip length">
          <select
            className={selectClass}
            value={clipMins}
            disabled={running}
            onChange={(e) => setClipMins(Number(e.target.value))}
          >
            {CLIP_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minute{m > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="ml-auto">
          {running ? (
            <Button variant="danger" onClick={stop}>
              <Square size={15} aria-hidden />
              Stop
            </Button>
          ) : (
            <Button onClick={start} disabled={!camera}>
              <SwitchCamera size={16} aria-hidden />
              Start camera
            </Button>
          )}
        </div>
      </div>

      {running && (
        <p className="mt-3 text-xs text-white/45">
          Live frames sent: {frames}. Keep this page open with the screen on, and the phone plugged in.
        </p>
      )}

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Uploaded clips</h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-white/45">
            A clip is uploaded every {clipMins} minute{clipMins > 1 ? "s" : ""}, and when you press Stop.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3">
                <span className="text-white/75">
                  {fmtTime(u.startAt)} – {fmtTime(u.endAt)}
                  <span className="ml-2 text-xs text-white/35">{(u.size / 1_048_576).toFixed(1)} MB</span>
                  {u.error && <span className="block text-xs text-red-300">{u.error}</span>}
                </span>
                <Badge tone={u.state === "done" ? "green" : u.state === "failed" ? "red" : "amber"}>{u.state}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-white/35">
        For testing and small setups. Clips are saved in the app&apos;s database, so delete old ones from Pickle Cam →
        Recordings. For everyday use, a fixed IP camera with its own storage is better.
      </p>
    </div>
  );
}
