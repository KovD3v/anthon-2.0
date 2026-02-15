/**
 * Shared API response helpers.
 *
 * Usage:
 *   import { jsonOk, unauthorized, serverError } from "@/lib/api/responses";
 *   return jsonOk({ data });
 *   return unauthorized();
 */

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 201, ...init });
}

// ---------------------------------------------------------------------------
// Client errors
// ---------------------------------------------------------------------------

export function badRequest(
  message = "Bad request",
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: message, ...extra }, { status: 400 });
}

export function unauthorized(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

export function rateLimited(
  message = "Rate limit exceeded",
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: message, ...extra }, { status: 429 });
}

// ---------------------------------------------------------------------------
// Server errors
// ---------------------------------------------------------------------------

export function serverError(
  message = "Internal server error",
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error: message, ...extra }, { status: 500 });
}
