export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { scheduleMonthlyCheck } = await import("@/lib/monthly-scheduler");
    scheduleMonthlyCheck();
  }
}
