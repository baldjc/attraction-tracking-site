// Bounded-await helper. Node/Prisma/Object-Storage calls have no built-in
// per-call timeout, so a degraded backend (Neon, bucket, Drive) makes an
// `await` hang indefinitely and the whole HTTP request never returns. Wrap every
// such await with `withTimeout` so it always settles, and tag it with a
// `subsystem` so the route can surface a precise, member-friendly error.

export type TimeoutSubsystem = "storage" | "database" | "upload" | "drive" | "other";

export class PhaseTimeoutError extends Error {
  constructor(
    public readonly phase: string,
    public readonly subsystem: TimeoutSubsystem,
    public readonly timeoutMs: number,
  ) {
    super(`phase "${phase}" (${subsystem}) timed out after ${timeoutMs}ms`);
    this.name = "PhaseTimeoutError";
  }
}

export async function withTimeout<T>(
  work: Promise<T> | (() => Promise<T>),
  opts: { phase: string; subsystem: TimeoutSubsystem; timeoutMs: number },
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const promise = typeof work === "function" ? work() : work;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PhaseTimeoutError(opts.phase, opts.subsystem, opts.timeoutMs)),
        opts.timeoutMs,
      );
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
