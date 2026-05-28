import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";

/**
 * Shared error boundary for member API route handlers.
 *
 * Why this exists: an App-Router route handler that throws returns an opaque
 * HTML 500 with no JSON body. On a Neon cold-start / connection drop the
 * unguarded Prisma call throws and white-screens the page. This wrapper
 * guarantees a structured JSON response for every error class and never lets a
 * bodyless HTML 500 escape.
 *
 * Classification:
 *  - transient DB/connection errors  -> 503 { error: "database_unavailable", retryAfter: 2 }
 *  - Prisma constraint/validation     -> 400 { error: "invalid_request", code }
 *  - everything else                  -> 500 { error: "internal_error" }
 *
 * Every error is logged server-side with the route name, the resolved userId
 * (best-effort), and the underlying error code/message.
 */

type RouteHandler = (...args: any[]) => Promise<Response> | Response;

// Prisma engine codes + node/pg errno values that indicate a transient
// connectivity problem the client can safely retry.
const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
]);

const TRANSIENT_ERRNO = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

const TRANSIENT_MESSAGE =
  /can'?t reach database|connection terminated|connection closed|connection is closed|server closed the connection|connection pool|timed out|timeout|ECONNRESET|ETIMEDOUT/i;

// Prisma known-request codes that map to a client/input problem (400).
const CONSTRAINT_PRISMA_CODES = new Set([
  "P2000", // Value too long for column
  "P2002", // Unique constraint failed
  "P2003", // Foreign key constraint failed
  "P2004", // A constraint failed
  "P2011", // Null constraint violation
  "P2012", // Missing required value
  "P2025", // Required record not found
]);

// Next.js implements redirect()/notFound() by THROWING a sentinel error that
// the framework catches upstream. We must never convert those into a JSON
// response — rethrow them untouched so routing control-flow keeps working.
function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest === "NEXT_NOT_FOUND" ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function getErrorName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

type Classification =
  | { kind: "transient" }
  | { kind: "constraint"; code?: string }
  | { kind: "unknown" };

function classify(err: unknown): Classification {
  const code = getErrorCode(err);
  const name = getErrorName(err);
  const message = getErrorMessage(err);

  if (
    name === "PrismaClientInitializationError" ||
    (code && TRANSIENT_PRISMA_CODES.has(code)) ||
    (code && TRANSIENT_ERRNO.has(code)) ||
    TRANSIENT_MESSAGE.test(message)
  ) {
    return { kind: "transient" };
  }

  if (
    name === "PrismaClientValidationError" ||
    (code && CONSTRAINT_PRISMA_CODES.has(code))
  ) {
    return { kind: "constraint", code };
  }

  return { kind: "unknown" };
}

async function bestEffortUserId(): Promise<string | null> {
  try {
    const user = await resolveUserFromSession();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export function withRouteErrorHandling<H extends RouteHandler>(
  routeName: string,
  handler: H,
): H {
  const wrapped = async (...args: Parameters<H>): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      // Let Next.js routing control-flow (redirect/notFound) propagate.
      if (isNextControlFlowError(err)) throw err;

      const classification = classify(err);
      const userId = await bestEffortUserId();
      const code = getErrorCode(err);

      console.error(
        `[api-error] route=${routeName} userId=${userId ?? "anon"} ` +
          `kind=${classification.kind} code=${code ?? "n/a"} ` +
          `name=${getErrorName(err) ?? "n/a"} message=${getErrorMessage(err)}`,
      );

      switch (classification.kind) {
        case "transient":
          return NextResponse.json(
            { error: "database_unavailable", retryAfter: 2 },
            { status: 503, headers: { "Retry-After": "2" } },
          );
        case "constraint":
          return NextResponse.json(
            { error: "invalid_request", code: classification.code ?? null },
            { status: 400 },
          );
        default:
          return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }
  };

  return wrapped as H;
}
