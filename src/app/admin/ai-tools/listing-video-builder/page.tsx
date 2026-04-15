"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ListingVideoBuilderTool from "@/components/ai-tools/ListingVideoBuilderTool";

export default function AdminListingVideoBuilderPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as any)?.role;
    if (!session || (role !== "admin" && role !== "editor")) {
      router.replace("/admin");
      return;
    }
    setReady(true);
  }, [session, status, router]);

  if (!ready) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <ListingVideoBuilderTool basePath="/admin/ai-tools" isAdmin />
    </div>
  );
}
