import { getDayAvailability } from "@/lib/booking";
import { route, ok } from "@/lib/api";
import { toManilaDateISO } from "@/lib/time";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? toManilaDateISO(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError("Please choose a valid date.", 400, "bad_date");
  }

  return ok(await getDayAvailability(date));
});
