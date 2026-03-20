"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ScriptReviewUI from "@/components/ScriptReviewUI";

export default function AdminScriptReviewPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (session && role === "editor") router.replace("/admin");
  }, [session, role, router]);

  if (role === "editor") return null;

  return <ScriptReviewUI isAdmin={true} />;
}
