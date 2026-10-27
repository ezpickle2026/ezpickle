import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, Errors } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: AppError) {
  return NextResponse.json(
    { ok: false, error: { message: error.message, code: error.code, details: error.details } },
    { status: error.status },
  );
}

/** Wraps a route handler: validation + Prisma errors become safe responses. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AppError) return fail(error);
      if (error instanceof ZodError) return fail(Errors.validation(error.flatten().fieldErrors));

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return fail(new AppError("That record already exists.", 409, "duplicate"));
        }
        if (error.code === "P2025") return fail(Errors.notFound());
      }

      // Exclusion constraint violation surfaces as a raw db error.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("booking_no_overlap")) return fail(Errors.slotTaken());

      console.error("[api]", error);
      return fail(Errors.generic());
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
