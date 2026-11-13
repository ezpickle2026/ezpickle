import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { route, ok } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { canWatchRecording } from "@/lib/picklecam";

export const dynamic = "force-dynamic";

/** Playback details for one replay, only for players who were on that court. */
export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const recording = await prisma.courtRecording.findUnique({
    where: { id },
    include: { court: { select: { name: true, number: true } } },
  });
  // Same answer for "missing" and "not yours", so ids can't be probed.
  if (!recording || !recording.videoUrl || !(await canWatchRecording(user, recording))) {
    throw Errors.notFound("That recording");
  }

  return ok(
    {
      recording: {
        id: recording.id,
        title: recording.title,
        startAt: recording.startAt,
        endAt: recording.endAt,
        court: recording.court,
        src: recording.videoUrl,
        type: recording.videoType,
        poster: recording.thumbnailUrl,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
