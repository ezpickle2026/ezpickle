import { getSessionUser } from "@/lib/auth";
import { route, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok({ user: await getSessionUser() }));
