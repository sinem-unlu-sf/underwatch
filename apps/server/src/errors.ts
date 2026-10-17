import type { ApiErrorCode } from "@kw/schema";

export const HTTP_STATUS: Record<ApiErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  invalid_transition: 409,
  note_required: 422,
  internal_error: 500,
  not_implemented: 501,
};

/** Thrown anywhere in request handling; the app's error handler turns it into an ApiError body. */
export class ApiHttpError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = HTTP_STATUS[code];
  }
}

export function notFound(kind: string, id: string): ApiHttpError {
  return new ApiHttpError("not_found", `${kind} "${id}" was not found.`);
}
