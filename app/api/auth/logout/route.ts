import { destroySession } from "@/lib/auth";
import { route, ok } from "@/lib/api";

export const POST = route(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
