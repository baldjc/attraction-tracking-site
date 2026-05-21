/**
 * Server-Sent Events helpers for the AI Thinking phase-event protocol.
 *
 * Streaming Claude routes emit two kinds of SSE events:
 *
 *   1. Phase events (status updates for the <AiThinking /> indicator):
 *        event: phase
 *        data: {"label":"Loading inputs...","percent":10}
 *
 *   2. Content/data events (token stream, completion payload, errors —
 *      the existing protocol used by v1 routes):
 *        data: {"type":"text","text":"..."}
 *
 * `parseSseEvent` on the client recognises both shapes so existing content
 * parsing keeps working while new phase events are routed to the hook.
 */

const ENCODER = new TextEncoder();

/**
 * Write an SSE `phase` event to a ReadableStream controller. Safe to call
 * from inside a streaming Claude route at meaningful checkpoints.
 *
 * Swallows enqueue errors silently — the controller may already be closed
 * (client disconnected) and we don't want phase emission to crash the route.
 */
export function emitPhase(
  controller: ReadableStreamDefaultController<Uint8Array>,
  label: string,
  percent?: number,
): void {
  const payload = percent === undefined ? { label } : { label, percent };
  const chunk = `event: phase\ndata: ${JSON.stringify(payload)}\n\n`;
  try {
    controller.enqueue(ENCODER.encode(chunk));
  } catch {
    // controller closed — ignore
  }
}

export interface ParsedSseEvent {
  /** "phase" for phase events, "message" (default) for regular `data:` events. */
  event: "phase" | "message";
  /** Raw data string (everything after `data: `). */
  data: string;
}

/**
 * Parse a single SSE event block (the text between two `\n\n` boundaries)
 * into `{ event, data }`. Returns null if the block has no `data:` line.
 *
 * Handles multi-line data per SSE spec (multiple `data:` lines join with `\n`),
 * but our streams emit single-line JSON so the common path is fast.
 */
export function parseSseEvent(block: string): ParsedSseEvent | null {
  let eventType: "phase" | "message" = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      const t = line.slice(7).trim();
      if (t === "phase") eventType = "phase";
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6));
    }
  }

  if (dataLines.length === 0) return null;
  return { event: eventType, data: dataLines.join("\n") };
}
