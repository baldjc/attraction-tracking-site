import { prisma } from "@/lib/prisma";

export async function logAdminAction(params: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, any>;
}) {
  try {
    await prisma.adminAction.create({ data: params });
  } catch (err) {
    console.error("Failed to log admin action:", err);
  }
}
