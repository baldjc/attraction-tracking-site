export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleMonthlyCheck } = await import("@/lib/monthly-scheduler");
    scheduleMonthlyCheck();

    const { scheduleYoutubeViewCounts } = await import("@/lib/youtube-scheduler");
    scheduleYoutubeViewCounts();

    const { scheduleFathomAutoPull } = await import("@/lib/fathom-scheduler");
    scheduleFathomAutoPull();

    try {
      const prisma = (await import("@/lib/prisma")).default;
      const existing = await prisma.user.findFirst({ where: { role: "admin" } });
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
      console.error("[setup] Error creating admin user:", err);
    }
  }
}
