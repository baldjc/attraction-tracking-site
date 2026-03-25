import prisma from "./prisma";
import bcrypt from "bcryptjs";

async function seedEditor() {
  const email = process.env.EDITOR_EMAIL;
  const tempPassword = process.env.EDITOR_TEMP_PASSWORD;
  const fullName = process.env.EDITOR_FULL_NAME ?? "Editor";

  if (!email || !tempPassword) {
    console.error("EDITOR_EMAIL and EDITOR_TEMP_PASSWORD environment variables are required.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "editor", passwordHash, fullName },
    create: {
      email,
      fullName,
      role: "editor",
      passwordHash,
    },
  });

  console.log(`Editor account created/updated: ${user.email} (${user.id})`);
  console.log("Password set from EDITOR_TEMP_PASSWORD env var. Please change after first login.");
}

seedEditor()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed editor:", err);
    process.exit(1);
  });
