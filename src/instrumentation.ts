export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleMonthlyCheck } = await import("@/lib/monthly-scheduler");
    scheduleMonthlyCheck();

    const prisma = (await import("@/lib/prisma")).default;
    const existing = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: "jared@attractionbyvideo.com",
          fullName: "Jared Chamberlain",
          role: "admin",
        },
      });
      console.log("[setup] Admin user created: jared@attractionbyvideo.com");
    }
  }
}
