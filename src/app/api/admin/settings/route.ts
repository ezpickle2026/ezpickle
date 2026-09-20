import { requirePermission } from "@/lib/guard";
import { assertCsrf } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requirePermission("court:read");
  return ok({ settings: await getSettings() });
});

export const PATCH = route(async (request: Request) => {
  await assertCsrf(request);
  const admin = await requirePermission("settings:write");
  const input = settingsSchema.parse(await readJson(request));

  const before = await getSettings();
  const merged = { ...before, ...input };

  if (merged.closingMin <= merged.openingMin) {
    throw new AppError("Closing time must be after opening time.", 400, "bad_hours");
  }
  if (merged.maxBookingMins < merged.minBookingMins) {
    throw new AppError("Maximum booking cannot be shorter than the minimum.", 400, "bad_duration");
  }
  if (merged.minBookingMins % merged.bookingIntervalMins !== 0) {
    throw new AppError(
      "Minimum booking must be a multiple of the booking interval.",
      400,
      "bad_interval",
    );
  }

  const settings = await updateSettings(input);

  await audit({
    userId: admin.id,
    actorEmail: admin.email,
    action: "settings.update",
    entity: "Setting",
    entityId: "business",
    before,
    after: settings,
  });

  return ok({ settings });
});
