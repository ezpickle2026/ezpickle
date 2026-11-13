import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canWatchRecording } from "@/lib/picklecam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = 4 * 1024 * 1024;

/**
 * Streams a phone-camera clip stored in Postgres, with HTTP Range support
 * (Safari will not play video without it). Each request re-checks that the
 * viewer may watch this recording.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  const recording = user ? await prisma.courtRecording.findUnique({ where: { id } }) : null;
  if (!user || !recording?.fileId || !(await canWatchRecording(user, recording))) {
    return new Response("Not found", { status: 404 });
  }

  const meta = await prisma.uploadedFile.findUnique({
    where: { id: recording.fileId },
    select: { size: true, mimeType: true },
  });
  if (!meta) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": meta.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = meta.size - 1;
  if (range) {
    if (range[1] === "") {
      start = Math.max(0, meta.size - Number(range[2]));
    } else {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), meta.size - 1) : Math.min(start + CHUNK - 1, meta.size - 1);
    }
    if (start > end || start >= meta.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${meta.size}` } });
    }
  }

  // Read only the requested bytes; Postgres substring() is 1-based.
  const rows = await prisma.$queryRaw<{ chunk: Buffer }[]>`
    SELECT substring(data from ${start + 1}::int for ${end - start + 1}::int) AS chunk
    FROM "UploadedFile" WHERE id = ${recording.fileId}`;
  const body = new Uint8Array(rows[0]?.chunk ?? []);

  if (!range) return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(meta.size) } });
  return new Response(body, {
    status: 206,
    headers: { ...headers, "Content-Length": String(body.length), "Content-Range": `bytes ${start}-${end}/${meta.size}` },
  });
}
