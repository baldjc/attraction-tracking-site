import mammoth from "mammoth";

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (ext === "pdf") {
    // Dynamic import to avoid issues with pdf-parse's require-time side effects
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = result.text?.trim() ?? "";
    if (!text) {
      throw new Error(`SCANNED_PDF:${filename}`);
    }
    return text;
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }

  throw new Error(`UNSUPPORTED_FORMAT:${filename}`);
}
