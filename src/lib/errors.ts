/**
 * Customer-safe errors. `message` is shown to the user; anything technical is
 * logged server-side and never leaves the process.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "bad_request",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: () => new AppError("Please sign in to continue.", 401, "unauthorized"),
  forbidden: () => new AppError("You do not have access to this action.", 403, "forbidden"),
  notFound: (what = "That record") => new AppError(`${what} could not be found.`, 404, "not_found"),
  slotTaken: () =>
    new AppError(
      "That court was just booked by another customer. Please choose another time.",
      409,
      "slot_taken",
    ),
  holdExpired: () =>
    new AppError("This booking has expired. Please start again.", 410, "hold_expired"),
  sessionFull: () => new AppError("This Open Play session is already full.", 409, "session_full"),
  rateLimited: () =>
    new AppError("Too many attempts. Please wait a moment and try again.", 429, "rate_limited"),
  validation: (details: unknown) =>
    new AppError("Please check the highlighted fields.", 422, "validation_error", details),
  payment: (msg = "Payment could not be completed. Please try again.") =>
    new AppError(msg, 402, "payment_error"),
  generic: () => new AppError("Something went wrong. Please try again.", 500, "internal_error"),
};
