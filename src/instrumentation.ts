async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 5000,
  label = "operation"
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(
        `[setup] ${label} failed (attempt ${attempt}/${retries}), retrying in ${delayMs / 1000}s...`,
        err instanceof Error ? err.message : err
      );
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw new Error(`[setup] ${label} exhausted all ${retries} retries`);
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleMonthlyCheck } = await import("@/lib/monthly-scheduler");
    scheduleMonthlyCheck();

    const { scheduleYoutubeViewCounts } = await import("@/lib/youtube-scheduler");
    scheduleYoutubeViewCounts();

    const { scheduleFathomAutoPull } = await import("@/lib/fathom-scheduler");
    scheduleFathomAutoPull();

    const { scheduleBackup } = await import("@/lib/backup-scheduler");
    scheduleBackup();

    try {
      const prisma = (await import("@/lib/prisma")).default;

      const existing = await withRetry(
        () => prisma.user.findFirst({ where: { role: "admin" } }),
        3,
        5000,
        "DB connection"
      );

      if (!existing) {
        await prisma.user.create({
          data: {
            email: "jared@attractionbyvideo.com",
            fullName: "Jared Chamberlain",
            role: "admin",
            updatedAt: new Date(),
          },
        });
        console.log("[setup] Admin user created: jared@attractionbyvideo.com");
      } else {
        console.log("[setup] Admin user already exists:", existing.email);
      }
    } catch (err) {
      console.error("[setup] DB connection failed after 3 attempts:", err);
    }
  }
}
