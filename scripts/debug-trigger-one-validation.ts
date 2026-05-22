import prisma from "@/lib/prisma";
import { runValidation } from "@/lib/fact-validator";

const USER_ID = "c3d00532-9a60-47cd-9287-66c4f5ea864f";

async function main() {
  const upload = await prisma.marketDataUpload.findFirst({
    where: { userId: USER_ID, status: "pending" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, monthYear: true, csvFileName: true },
  });
  if (!upload) {
    console.log("No pending upload found for user", USER_ID);
    return;
  }
  console.log("Picking upload:", upload);
  try {
    await runValidation(upload.id);
    console.log("runValidation returned cleanly for", upload.id);
  } catch (err) {
    console.error("runValidation threw:", err);
    if (err instanceof Error && err.stack) console.error(err.stack);
  }
}

main()
  .catch((err) => {
    console.error("top-level catch:", err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
