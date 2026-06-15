let schedulerStarted = false;

function msUntilNextThursday8pm(): number {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 4=Thu
  const daysUntilThursday = ((4 - day) + 7) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilThursday);
  next.setHours(20, 0, 0, 0);

  // If today is Thursday and 8pm hasn't passed yet
  if (daysUntilThursday === 0 && now.getHours() < 20) {
    // Use this Thursday's 8pm
  } else if (daysUntilThursday === 0 && now.getHours() >= 20) {
    // Already past 8pm Thursday — next Thursday
    next.setDate(next.getDate() + 7);
  }

  return next.getTime() - now.getTime();
}

async function runFathomAutoPull() {
  console.log("[fathom-scheduler] Starting automatic Thursday pull...");
  try {
    const prisma = (await import("@/lib/prisma")).default;
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { PRINCIPLES } = await import("@/app/api/admin/resources/lessons/route");

    const apiKey = await prisma.appSetting.findUnique({ where: { key: "fathom_api_key" } });
    if (!apiKey?.value) {
      console.log("[fathom-scheduler] No Fathom API key configured — skipping auto-pull");
      return;
    }

    const recordingEmail = await prisma.appSetting.findUnique({ where: { key: "fathom_recording_email" } });
    const titleFilter = await prisma.appSetting.findUnique({ where: { key: "fathom_title_filter" } });
    const lastPullDate = await prisma.appSetting.findUnique({ where: { key: "fathom_last_pull_date" } });

    const params = new URLSearchParams({ include_transcript: "true", limit: "50" });
    if (lastPullDate?.value) params.set("created_after", lastPullDate.value);

    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
      headers: { Authorization: `Bearer ${apiKey.value}`, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[fathom-scheduler] API error ${res.status}: ${text}`);
      await prisma.appSetting.upsert({ where: { key: "fathom_last_pull_status" }, create: { key: "fathom_last_pull_status", value: "failed" }, update: { value: "failed" } });
      return;
    }

    const data = await res.json();
    const meetings = data.items ?? data.meetings ?? data ?? [];
    const titleFilterVal = titleFilter?.value ?? "Q&A";
    const emailVal = recordingEmail?.value ?? "";

    const filtered = meetings.filter((m: any) => {
      const titleMatch = !titleFilterVal || (m.title ?? "").toLowerCase().includes(titleFilterVal.toLowerCase());
      const emailMatch = !emailVal || m.organizer_email === emailVal || m.recorded_by === emailVal;
      return titleMatch && emailMatch;
    });

    const fathomIds = filtered.map((m: any) => m.id);
    const existing = await prisma.qACall.findMany({ where: { fathomId: { in: fathomIds } }, select: { fathomId: true } });
    const existingSet = new Set(existing.map((e) => e.fathomId));
    const newCalls = filtered.filter((m: any) => !existingSet.has(m.id));

    console.log(`[fathom-scheduler] Found ${filtered.length} matching calls, ${newCalls.length} new`);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const members = await prisma.user.findMany({ where: { role: "foundations_member" }, select: { id: true, fullName: true, email: true } });

    for (const m of newCalls) {
      try {
        const qaCall = await prisma.qACall.create({
          data: {
            fathomId: m.id,
            title: m.title ?? "Untitled Q&A",
            callDate: new Date(m.started_at ?? m.created_at ?? Date.now()),
            fathomShareUrl: m.share_url ?? m.url ?? "",
            fullTranscript: m.transcript ?? "",
            status: "pending_review",
          },
        });

        if (m.transcript?.trim()) {
          const prompt = `You are processing a Q&A coaching call transcript from Attraction by Video. Extract distinct coaching moments and general teaching segments. For each moment return a JSON array:
[{ "subTopic": string, "principles": string[], "summary": string, "timestampStart": number, "timestampEnd": number, "searchableText": string, "memberName": string|null, "isGeneralTeaching": boolean }]
The 16 Attraction principles are: ${PRINCIPLES.join(", ")}.
Return ONLY valid JSON array.
Transcript: ${m.transcript.substring(0, 15000)}`;

          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 6000,
            messages: [{ role: "user", content: prompt }],
          });

          const text = response.content[0].type === "text" ? response.content[0].text : "";
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const moments = JSON.parse(jsonMatch[0]);
            for (const moment of moments) {
              const memberId = moment.memberName ? fuzzyMatch(moment.memberName, members) : null;
              await prisma.knowledgeBaseEntry.create({
                data: {
                  sourceType: "qa_call",
                  sourceId: qaCall.id,
                  principles: moment.principles,
                  subTopic: moment.subTopic,
                  summary: moment.summary,
                  searchableText: moment.searchableText,
                  timestampStart: moment.timestampStart,
                  timestampEnd: moment.timestampEnd,
                  memberId,
                  isGeneralTeaching: moment.isGeneralTeaching,
                  status: "pending",
                },
              });
            }
          }
          await prisma.qACall.update({ where: { id: qaCall.id }, data: { status: "processed" } });
        }
      } catch (err) {
        console.error(`[fathom-scheduler] Error processing call ${m.id}:`, err);
      }
    }

    await prisma.appSetting.upsert({ where: { key: "fathom_last_pull_date" }, create: { key: "fathom_last_pull_date", value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
    await prisma.appSetting.upsert({ where: { key: "fathom_last_pull_status" }, create: { key: "fathom_last_pull_status", value: "success" }, update: { value: "success" } });
    console.log(`[fathom-scheduler] Auto-pull complete. Imported ${newCalls.length} new calls.`);
  } catch (err) {
    console.error("[fathom-scheduler] Auto-pull failed:", err);
  }
}

function fuzzyMatch(name: string, members: Array<{ id: string; fullName: string | null; email: string }>): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  for (const m of members) {
    const full = (m.fullName ?? "").toLowerCase();
    const first = full.split(" ")[0];
    const last = full.split(" ").slice(-1)[0];
    if (full === n || first === n || last === n) return m.id;
  }
  return null;
}

function scheduleNext() {
  const ms = msUntilNextThursday8pm();
  const hours = Math.round(ms / 3600000);
  console.log(`[fathom-scheduler] Next auto-pull in ~${hours} hours (Thursday 8:00 PM)`);
  setTimeout(async () => {
    await runFathomAutoPull().catch(console.error);
    scheduleNext();
  }, ms);
}

export function scheduleFathomAutoPull() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[fathom-scheduler] Scheduler started — runs every Thursday at 8:00 PM");
  scheduleNext();
}
