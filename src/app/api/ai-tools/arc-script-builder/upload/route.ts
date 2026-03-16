import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { extractText } from "@/lib/text-extractor";

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"]);

function ext(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (fileEntries.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 });
  }

  const results: { filename: string; text?: string; error?: string }[] = [];

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) {
      results.push({ filename: "unknown", error: "Invalid file entry" });
      continue;
    }

    const filename = entry.name;
    const fileExt = ext(filename);

    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      results.push({ filename, error: `Unsupported file type: .${fileExt}` });
      continue;
    }

    if (entry.size > MAX_BYTES) {
      results.push({ filename, error: "File exceeds 10MB limit" });
      continue;
    }

    try {
      const arrayBuffer = await entry.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const text = await extractText(buffer, filename);
      results.push({ filename, text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("SCANNED_PDF:")) {
        results.push({ filename, error: "This PDF appears to be a scanned image. Try copying and pasting the content instead." });
      } else if (msg.startsWith("UNSUPPORTED_FORMAT:")) {
        results.push({ filename, error: `Unsupported file type: .${fileExt}` });
      } else {
        results.push({ filename, error: "Couldn't read this file. Try pasting the text directly instead." });
      }
    }
  }

  return NextResponse.json({ results });
}
