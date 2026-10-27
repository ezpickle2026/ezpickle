import { quote } from "@/lib/booking";
import { quoteSchema } from "@/lib/validation";
import { route, ok, readJson } from "@/lib/api";

export const POST = route(async (request: Request) => {
  const input = quoteSchema.parse(await readJson(request));
  const result = await quote({
    courtId: input.courtId,
    dateISO: input.date,
    startMin: input.startMin,
    durationMins: input.durationMins,
    promoCode: input.promoCode,
  });
  return ok(result);
});
