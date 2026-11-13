"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { CamPlayer, type CamStreamType } from "@/components/pickle-cam/player";
import {
  Badge,
  Button,
  Card,
  Cell as Td,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Row,
  Skeleton,
  Table,
  confirmAction,
  fmtDate,
  fmtTime,
  inputClass,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";

type Court = { id: string; name: string; number: number };
type Camera = {
  id: string;
  courtId: string;
  name: string;
  liveUrl: string | null;
  liveType: CamStreamType;
  ingestKeyHint: string;
  active: boolean;
  online: boolean;
  lastSeenAt: string | null;
  court: { name: string; number: number };
  _count: { recordings: number };
};
type Recording = {
  id: string;
  courtId: string;
  title: string | null;
  startAt: string;
  endAt: string | null;
  status: "RECORDING" | "PROCESSING" | "READY" | "FAILED";
  videoUrl: string | null;
  videoType: CamStreamType;
  thumbnailUrl: string | null;
  published: boolean;
  error: string | null;
  court: { name: string; number: number };
  camera: { name: string } | null;
  booking: { reference: string; customer: { fullName: string } } | null;
};

const TYPES: { value: CamStreamType; label: string }[] = [
  { value: "HLS", label: "HLS (.m3u8)" },
  { value: "MP4", label: "MP4 video file" },
  { value: "MJPEG", label: "MJPEG (IP camera)" },
  { value: "EMBED", label: "Embed page (iframe)" },
];

const STATUS_TONE = { READY: "green", RECORDING: "amber", PROCESSING: "amber", FAILED: "red" } as const;

const blankCamera = { courtId: "", name: "Main camera", liveUrl: "", liveType: "HLS" as CamStreamType, active: true };
const blankRecording = {
  courtId: "",
  title: "",
  startAt: "",
  endAt: "",
  videoUrl: "",
  videoType: "MP4" as CamStreamType,
  thumbnailUrl: "",
  published: true,
};

/** datetime-local values are read as Manila time, wherever the admin is. */
const manila = (local: string) => (local ? `${local}:00+08:00` : local);

export default function AdminPickleCamPage() {
  const toast = useToast();
  const courts = useResource<{ courts: Court[] }>("/api/admin/courts");
  const cameras = useResource<{ cameras: Camera[] }>("/api/admin/cameras");
  const [filter, setFilter] = useState({ courtId: "", date: "" });
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const recordings = useResource<{ recordings: Recording[] }>(`/api/admin/recordings${qs ? `?${qs}` : ""}`);
  const { run, busy } = useMutate();

  const [editing, setEditing] = useState<(typeof blankCamera & { id?: string }) | null>(null);
  const [adding, setAdding] = useState<typeof blankRecording | null>(null);
  const [issuedKey, setIssuedKey] = useState<{ camera: string; key: string } | null>(null);
  const [preview, setPreview] = useState<{ title: string; src: string; type: CamStreamType; live: boolean; poster?: string | null } | null>(null);

  const courtList = courts.data?.courts ?? [];

  async function saveCamera() {
    if (!editing) return;
    const { id, ...body } = editing;
    const payload = { ...body, liveUrl: body.liveUrl || null };
    const result = await run(
      () =>
        id
          ? api(`/api/admin/cameras/${id}`, { method: "PATCH", body: payload })
          : api<{ key: string; camera: Camera }>("/api/admin/cameras", { body: payload }),
      { success: id ? "Camera updated." : "Camera added.", onDone: cameras.reload },
    );
    if (result) {
      if (!id && "key" in (result as object)) {
        const created = result as { key: string; camera: Camera };
        setIssuedKey({ camera: `${created.camera.court.name} · ${created.camera.name}`, key: created.key });
      }
      setEditing(null);
    }
  }

  async function rotateKey(camera: Camera) {
    if (!confirmAction(`Issue a new key for ${camera.court.name} · ${camera.name}? The old key stops working right away.`)) return;
    const result = await run(() => api<{ key: string }>(`/api/admin/cameras/${camera.id}/rotate-key`, { body: {} }), {
      onDone: cameras.reload,
    });
    if (result) setIssuedKey({ camera: `${camera.court.name} · ${camera.name}`, key: result.key });
  }

  async function addRecording() {
    if (!adding) return;
    const ok = await run(
      () =>
        api("/api/admin/recordings", {
          body: {
            ...adding,
            startAt: manila(adding.startAt),
            endAt: manila(adding.endAt),
            title: adding.title || null,
            thumbnailUrl: adding.thumbnailUrl || null,
          },
        }),
      { success: "Recording added.", onDone: recordings.reload },
    );
    if (ok) setAdding(null);
  }

  return (
    <div>
      <PageHeader
        title="Pickle Cam"
        description="Court cameras and game recordings. Players only see videos from the court and time they played."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding({ ...blankRecording, courtId: courtList[0]?.id ?? "" })}>
              <Plus size={16} aria-hidden />
              Add recording
            </Button>
            <Button onClick={() => setEditing({ ...blankCamera, courtId: courtList[0]?.id ?? "" })}>
              <Plus size={16} aria-hidden />
              Connect camera
            </Button>
          </>
        }
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Cameras</h2>
        {cameras.loading && !cameras.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (cameras.data?.cameras ?? []).length === 0 ? (
          <EmptyState
            title="No cameras connected"
            description="Connect a camera to a court. You'll get a key the camera or recorder uses to send its live feed and recordings."
          />
        ) : (
          <Table head={["Court", "Camera", "Status", "Live feed", "Key", "Videos", ""]} minWidth={900}>
            {cameras.data!.cameras.map((cam) => (
              <Row key={cam.id}>
                <Td className="font-medium text-white/90">{cam.court.name}</Td>
                <Td>{cam.name}</Td>
                <Td>
                  <Badge tone={!cam.active ? "neutral" : cam.online ? "green" : "red"}>
                    {!cam.active ? "disabled" : cam.online ? "online" : "offline"}
                  </Badge>
                  <span className="mt-1 block text-[11px] text-white/35">
                    {cam.lastSeenAt ? `Seen ${fmtDate(cam.lastSeenAt, { year: undefined })} ${fmtTime(cam.lastSeenAt)}` : "Never connected"}
                  </span>
                </Td>
                <Td>{cam.liveUrl ? cam.liveType : <span className="text-white/35">None</span>}</Td>
                <Td className="font-mono text-xs">••••{cam.ingestKeyHint}</Td>
                <Td align="right" className="tabular-nums">
                  {cam._count.recordings}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {cam.liveUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPreview({ title: `${cam.court.name} · ${cam.name}`, src: cam.liveUrl!, type: cam.liveType, live: true })
                        }
                      >
                        Watch
                      </Button>
                    )}
                    <Link href={`/admin/pickle-cam/phone/${cam.id}`}>
                      <Button size="sm" variant="ghost">
                        Use phone
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          id: cam.id,
                          courtId: cam.courtId,
                          name: cam.name,
                          liveUrl: cam.liveUrl ?? "",
                          liveType: cam.liveType,
                          active: cam.active,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => rotateKey(cam)}>
                      New key
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!confirmAction(`Remove ${cam.name} from ${cam.court.name}? Its recordings are kept.`)) return;
                        void run(() => api(`/api/admin/cameras/${cam.id}`, { method: "DELETE" }), {
                          success: "Camera removed.",
                          onDone: cameras.reload,
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Recordings</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className={selectClass}
              value={filter.courtId}
              onChange={(e) => setFilter({ ...filter, courtId: e.target.value })}
              aria-label="Filter by court"
            >
              <option value="">All courts</option>
              {courtList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={selectClass}
              value={filter.date}
              onChange={(e) => setFilter({ ...filter, date: e.target.value })}
              aria-label="Filter by date"
            />
          </div>
        </div>

        {recordings.loading && !recordings.data ? (
          <Skeleton className="h-60 w-full" />
        ) : (recordings.data?.recordings ?? []).length === 0 ? (
          <EmptyState
            title="No recordings"
            description="Recordings appear here when a connected camera reports a finished clip, or when you add one by link."
          />
        ) : (
          <Table head={["When", "Court", "Camera", "Linked booking", "Status", "Players", ""]} minWidth={940}>
            {recordings.data!.recordings.map((rec) => (
              <Row key={rec.id}>
                <Td>
                  <span className="block text-white/90">{fmtDate(rec.startAt)}</span>
                  <span className="text-xs text-white/40">
                    {fmtTime(rec.startAt)}
                    {rec.endAt ? ` – ${fmtTime(rec.endAt)}` : ""}
                  </span>
                </Td>
                <Td>
                  {rec.court.name}
                  {rec.title && <span className="block text-xs text-white/40">{rec.title}</span>}
                </Td>
                <Td>{rec.camera?.name ?? <span className="text-white/35">Added by link</span>}</Td>
                <Td>
                  {rec.booking ? (
                    <>
                      <span className="font-mono text-xs">{rec.booking.reference}</span>
                      <span className="block text-xs text-white/40">{rec.booking.customer.fullName}</span>
                    </>
                  ) : (
                    <span className="text-white/35">—</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[rec.status]}>{rec.status.toLowerCase()}</Badge>
                  {rec.error && <span className="mt-1 block max-w-[180px] truncate text-[11px] text-red-300">{rec.error}</span>}
                </Td>
                <Td>
                  <Badge tone={rec.published ? "green" : "neutral"}>{rec.published ? "visible" : "hidden"}</Badge>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {rec.videoUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPreview({
                            title: `${rec.court.name} · ${fmtDate(rec.startAt)} ${fmtTime(rec.startAt)}`,
                            src: rec.videoUrl!,
                            type: rec.videoType,
                            live: false,
                            poster: rec.thumbnailUrl,
                          })
                        }
                      >
                        Play
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api(`/api/admin/recordings/${rec.id}`, { method: "PATCH", body: { published: !rec.published } }),
                          { success: rec.published ? "Hidden from players." : "Visible to players.", onDone: recordings.reload },
                        )
                      }
                    >
                      {rec.published ? "Hide" : "Show"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!confirmAction("Delete this recording from EzPickle? The file on the recorder is not touched.")) return;
                        void run(() => api(`/api/admin/recordings/${rec.id}`, { method: "DELETE" }), {
                          success: "Recording deleted.",
                          onDone: recordings.reload,
                        });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </section>

      <ConnectionGuide />

      {/* ------------------------------------------------ camera editor */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit camera" : "Connect a camera"}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Court">
                <select
                  className={`${selectClass} w-full`}
                  value={editing.courtId}
                  onChange={(e) => setEditing({ ...editing, courtId: e.target.value })}
                >
                  {courtList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Camera name">
                <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Live feed link (optional)" hint="The camera can also send this itself with a heartbeat.">
              <input
                className={inputClass}
                placeholder="https://cam.example.com/court1/index.m3u8"
                value={editing.liveUrl}
                onChange={(e) => setEditing({ ...editing, liveUrl: e.target.value })}
              />
            </Field>
            <Field label="Live feed format">
              <select
                className={`${selectClass} w-full`}
                value={editing.liveType}
                onChange={(e) => setEditing({ ...editing, liveType: e.target.value as CamStreamType })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-white/75">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active (a disabled camera's key is refused)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={saveCamera} disabled={!editing.courtId}>
                {editing.id ? "Save" : "Connect & get key"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------ manual recording */}
      <Modal open={Boolean(adding)} onClose={() => setAdding(null)} title="Add a recording by link">
        {adding && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Court">
                <select
                  className={`${selectClass} w-full`}
                  value={adding.courtId}
                  onChange={(e) => setAdding({ ...adding, courtId: e.target.value })}
                >
                  {courtList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title (optional)">
                <input className={inputClass} value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
              </Field>
              <Field label="Start (Manila time)">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={adding.startAt}
                  onChange={(e) => setAdding({ ...adding, startAt: e.target.value })}
                />
              </Field>
              <Field label="End (Manila time)">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={adding.endAt}
                  onChange={(e) => setAdding({ ...adding, endAt: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Video link">
              <input
                className={inputClass}
                placeholder="https://storage.example.com/court1/2026-11-13-1800.mp4"
                value={adding.videoUrl}
                onChange={(e) => setAdding({ ...adding, videoUrl: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Format">
                <select
                  className={`${selectClass} w-full`}
                  value={adding.videoType}
                  onChange={(e) => setAdding({ ...adding, videoType: e.target.value as CamStreamType })}
                >
                  {TYPES.filter((t) => t.value !== "MJPEG").map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Thumbnail link (optional)">
                <input
                  className={inputClass}
                  value={adding.thumbnailUrl}
                  onChange={(e) => setAdding({ ...adding, thumbnailUrl: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={addRecording}>
                Add recording
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------ key, shown once */}
      <Modal open={Boolean(issuedKey)} onClose={() => setIssuedKey(null)} title="Camera key">
        {issuedKey && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Key for <span className="font-semibold text-white">{issuedKey.camera}</span>. Copy it now: it won&apos;t be shown
              again. Put it in the camera, recorder or agent settings as a Bearer token.
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-pickle-500/30 bg-pickle-500/10 p-3">
              <KeyRound size={16} className="shrink-0 text-pickle-400" aria-hidden />
              <code className="min-w-0 flex-1 break-all text-sm text-white">{issuedKey.key}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(issuedKey.key);
                  toast.push("Key copied.");
                }}
              >
                <Copy size={14} aria-hidden />
                Copy
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setIssuedKey(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.title ?? ""} wide>
        {preview && (
          <CamPlayer
            src={preview.src}
            type={preview.type}
            live={preview.live}
            poster={preview.poster}
            caption={preview.title.split(" · ")[0]}
          />
        )}
      </Modal>
    </div>
  );
}

/** How to point a camera / recorder at EzPickle. */
function ConnectionGuide() {
  const [origin, setOrigin] = useState("https://your-site");
  useEffect(() => setOrigin(window.location.origin), []);
  const endpoint = `${origin}/api/cam/ingest`;
  const heartbeat = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ezcam_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"heartbeat","liveUrl":"https://cam.example.com/court1/index.m3u8","liveType":"HLS"}'`;
  const completed = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ezcam_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"recording.completed","externalId":"clip-0001",
       "startAt":"2026-11-13T18:00:00+08:00","endAt":"2026-11-13T19:00:00+08:00",
       "videoUrl":"https://storage.example.com/court1/clip-0001.mp4","videoType":"MP4",
       "thumbnailUrl":"https://storage.example.com/court1/clip-0001.jpg"}'`;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold text-white">Connecting a camera</h2>
      <Card className="space-y-4 text-sm text-white/65">
        <p className="rounded-xl bg-pickle-500/10 p-3 text-pickle-200">
          <b>Testing with a phone?</b> Connect a camera here, then open this page on the phone, press{" "}
          <b>Use phone</b> on that camera and <b>Start camera</b>. No key or extra app needed.
        </p>
        <p>
          Each camera sends events to <code className="text-pickle-300">{endpoint}</code> with its key. Any camera, NVR or a
          small script beside it can do this. The video itself stays on your recorder or storage; EzPickle keeps the link and
          decides who may watch it.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <b className="text-white/85">heartbeat</b> every minute keeps the camera &quot;online&quot; and can update its live
            link.
          </li>
          <li>
            <b className="text-white/85">recording.started</b> (optional) when a clip begins.
          </li>
          <li>
            <b className="text-white/85">recording.completed</b> when a clip is saved. It is matched to bookings on that court
            by time automatically.
          </li>
          <li>
            <b className="text-white/85">recording.failed</b> if a clip couldn&apos;t be saved.
          </li>
        </ol>
        <pre className="ezp-scroll overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-white/80">{heartbeat}</pre>
        <pre className="ezp-scroll overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-white/80">{completed}</pre>
        <p className="text-xs text-white/40">
          Use HTTPS links. For private storage, use signed links that stay valid for the whole 30-day replay window.
        </p>
      </Card>
    </section>
  );
}
