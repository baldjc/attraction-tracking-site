import mammoth from "mammoth";

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (ext === "pdf") {
    const pdfParseModule: any = await import("pdf-parse");
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
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

  if (ext === "txt" || ext === "md" || ext === "csv") {
    return buffer.toString("utf-8");
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        lines.push(`=== Sheet: ${sheetName} ===`);
        lines.push(csv.trim());
      }
    }
    const text = lines.join("\n\n").trim();
    if (!text) throw new Error(`EMPTY_FILE:${filename}`);
    return text;
  }

  throw new Error(`UNSUPPORTED_FORMAT:${filename}`);
}
