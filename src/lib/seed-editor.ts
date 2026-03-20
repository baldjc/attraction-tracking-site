import prisma from "./prisma";
import bcrypt from "bcryptjs";

async function seedEditor() {
  const email = "connor@apstlstudios.com";
  const fullName = "Connor Strauss";
  // Change this password after first login
  const tempPassword = "ABV-editor-2026!";

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
  console.log(`Temporary password: ${tempPassword}`);
  console.log("Please change this password after first login.");
}

seedEditor()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed editor:", err);
    process.exit(1);
  });
