import prisma from "./prisma";
import bcrypt from "bcryptjs";

export async function ensureAdminExists() {
  const adminEmail = process.env.ADMIN_EMAIL || "jared@chamberlaingroup.ca";
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existing) {
    const tempPassword = "admin-" + Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: "Jared Chamberlain",
        passwordHash: hash,
        role: "admin",
        emailVerified: true,
      },
    });

    console.log(`\n=== ADMIN ACCOUNT CREATED ===`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Temporary password: ${tempPassword}`);
    console.log(`Change this password after first login!`);
    console.log(`==============================\n`);
  }
}
