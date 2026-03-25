"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";

export default function AdminAIToolsHubPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (session && role === "editor") router.replace("/admin");
  }, [session, role, router]);

  if (role === "editor") return null;

  return <AIToolsHub basePath="/admin/ai-tools" />;
}
