import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const NEON_URL =
  "postgresql://neondb_owner:npg_A0Xneoz5xFhd@ep-odd-dream-amrl8l3f-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const connectionString = process.env.NEON_DATABASE_URL?.replace(/\s+/g, "") ?? NEON_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Academy / Foundations Library…");

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function bullets(...items: string[]) {
    return items.map((i) => `- ${i}`).join("\n");
  }

  // ── Sections ─────────────────────────────────────────────────────────────────

  const s1 = await prisma.courseSection.upsert({
    where: { slug: "your-why" },
    create: {
      title: "Your Why",
      slug: "your-why",
      description: null,
      sortOrder: 1,
      published: true,
    },
    update: { title: "Your Why", sortOrder: 1 },
  });

  const s2 = await prisma.courseSection.upsert({
    where: { slug: "positioning-your-channel" },
    create: {
      title: "Positioning Your Channel",
      slug: "positioning-your-channel",
      sortOrder: 2,
      published: true,
    },
    update: { title: "Positioning Your Channel", sortOrder: 2 },
  });

  const s3 = await prisma.courseSection.upsert({
    where: { slug: "on-camera-confidence" },
    create: {
      title: "On-Camera Confidence",
      slug: "on-camera-confidence",
      sortOrder: 3,
      published: true,
    },
    update: { title: "On-Camera Confidence", sortOrder: 3 },
  });

  const s4 = await prisma.courseSection.upsert({
    where: { slug: "creation" },
    create: {
      title: "Creation",
      slug: "creation",
      sortOrder: 4,
      published: true,
    },
    update: { title: "Creation", sortOrder: 4 },
  });

  const s5 = await prisma.courseSection.upsert({
    where: { slug: "packaging" },
    create: {
      title: "Packaging",
      slug: "packaging",
      sortOrder: 5,
      published: true,
    },
    update: { title: "Packaging", sortOrder: 5 },
  });

  const s6 = await prisma.courseSection.upsert({
    where: { slug: "your-first-10-videos" },
    create: {
      title: "Your First 10 Videos",
      slug: "your-first-10-videos",
      sortOrder: 6,
      published: true,
    },
    update: { title: "Your First 10 Videos", sortOrder: 6 },
  });

  console.log("✓ Sections created");

  // ── Lessons ──────────────────────────────────────────────────────────────────

  // Section 1 — Your Why (1 lesson, workbook only)
  const l1_1 = await prisma.courseLesson.upsert({
    where: { slug: "your-why-workbook" },
    create: {
      sectionId: s1.id,
      title: "Your Why — Workbook",
      slug: "your-why-workbook",
      youtubeUrl: null,
      description:
        "Before diving into content creation, take time to clarify what you truly want from your YouTube journey and business. This workbook section helps you define your purpose, set commitment boundaries, and build accountability.",
      keyTakeaways: null,
      actionItems: null,
      sortOrder: 1,
      published: true,
      principleTags: ["avatar_clarity"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Your Why — Workbook", sortOrder: 1, description: "Define your purpose, set commitment boundaries, and build accountability before diving into content creation." },
  });

  // Section 2 — Positioning Your Channel (4 lessons)
  const l2_1 = await prisma.courseLesson.upsert({
    where: { slug: "what-do-you-want" },
    create: {
      sectionId: s2.id,
      title: "What Do You Want",
      slug: "what-do-you-want",
      youtubeUrl: "https://youtu.be/fyUJbkA1Iys",
      description:
        "This opening lesson challenges you to move beyond traditional SMART goals and instead clarify what you genuinely want from your YouTube journey and business. Jared introduces desire-based focus, where purpose is rooted in who you are becoming rather than in external metrics.",
      keyTakeaways: bullets(
        "Your purpose is fragile if rooted in success, but untouchable if rooted in who you are becoming",
        "Desire-based focus creates more momentum than traditional goal-setting frameworks",
        "Write down 10–15 goals, then cross off anything that doesn't spark genuine excitement — this creates space for YouTube",
        "The full system flows: Video Content → Lead Magnets → CRM → Email Newsletter → Connection Calls → Raised Hand Retargeting",
        'Use a weekly "Becoming Clear" clarity break to stay aligned with your wants'
      ),
      actionItems: bullets(
        "Write down 10–15 current business goals, evaluate how each makes you feel, and cross off any that don't spark genuine desire",
        'Complete the "Becoming Clear" clarity break document for the first time',
        "Answer the five reflection questions (daily life, business vision, ideal clients, hobbies, YouTube impact)"
      ),
      sortOrder: 1,
      published: true,
      principleTags: ["avatar_clarity"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "What Do You Want", sortOrder: 1, description: "Move beyond SMART goals and clarify what you genuinely want from your YouTube journey — rooted in who you're becoming, not external metrics." },
  });

  const l2_2 = await prisma.courseLesson.upsert({
    where: { slug: "who-do-you-want" },
    create: {
      sectionId: s2.id,
      title: "Who Do You Want",
      slug: "who-do-you-want",
      youtubeUrl: "https://youtu.be/kdAkzkTw6gQ",
      description:
        "Covers the critical importance of defining a single perfect client avatar. You'll learn that speaking to multiple audiences makes your content generic and forgettable, and walk through how to build a detailed avatar that aligns with your 5–10 year business goals.",
      keyTakeaways: bullets(
        "When you speak to everyone, you speak to no one — choose one avatar",
        "Your avatar should align with your long-term business goals, not just short-term profitability",
        'The "napkin test": if you can\'t describe your perfect client in 60 seconds, you don\'t know them well enough',
        "People work with people like them — your values and authenticity attract your ideal client",
        "Once your avatar is locked, everything downstream becomes easier: themes, titles, thumbnails, lead magnets"
      ),
      actionItems: bullets(
        "Complete the Avatar Architect to produce a detailed avatar document",
        "Answer the seven avatar-deepening questions",
        "Clean up and personalise the generated avatar document"
      ),
      sortOrder: 2,
      published: true,
      principleTags: ["avatar_clarity", "values_peppering"],
      aiToolLink: "/member/ai-tools/avatar-architect",
      aiToolLabel: "Build Your Avatar",
    },
    update: { title: "Who Do You Want", sortOrder: 2, description: "Define a single perfect client avatar so your content speaks directly to one person instead of being generic and forgettable." },
  });

  const l2_3 = await prisma.courseLesson.upsert({
    where: { slug: "finding-your-themes" },
    create: {
      sectionId: s2.id,
      title: "Finding Your Themes",
      slug: "finding-your-themes",
      youtubeUrl: "https://youtu.be/AQ4gVcpFLiA",
      description:
        'Building on your avatar work, this lesson teaches you how to identify repeatable content themes (or "buckets") rather than chasing individual video topics. You\'ll find patterns in avatar questions and group them into 1–3 core themes that sustain a consistent publishing schedule indefinitely.',
      keyTakeaways: bullets(
        "Answer five key questions about your avatar, then look for patterns — those patterns are your themes",
        "Themes are bigger than any single question; they are repeatable content categories you rotate through",
        "Start with one theme, grow to two or three — don't try to build ten",
        "Consistency (publishing weekly without fail) is a foundational competitive advantage",
        "Focus on the emotional side: use content to give your avatar clarity, which builds trust"
      ),
      actionItems: bullets(
        "Write 3–5 answers for each of the five avatar questions",
        "Identify patterns and group them into 1–3 themes",
        "Choose one primary theme to start producing content around immediately"
      ),
      sortOrder: 3,
      published: true,
      principleTags: ["themes_over_topics", "avatar_clarity", "consistency", "values_peppering"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Finding Your Themes", sortOrder: 3, description: "Identify repeatable content themes from your avatar's questions — 1 to 3 core buckets that sustain a consistent publishing schedule indefinitely." },
  });

  const l2_4 = await prisma.courseLesson.upsert({
    where: { slug: "client-journey-building-trust" },
    create: {
      sectionId: s2.id,
      title: "The Client Journey and Building Trust",
      slug: "client-journey-building-trust",
      youtubeUrl: "https://youtu.be/AjqWrvFAO-c",
      description:
        "Maps the three-stage client journey — Awareness, Consumption, and Action — and explains that trust is only built during Consumption. You'll learn four trust-building techniques for video content: visual proof, data, stories, and authority.",
      keyTakeaways: bullets(
        "Every viewer moves through Awareness → Consumption → Action; you can't skip stages",
        "Trust is built during Consumption — that requires a watchable channel",
        '"Show and Tell": always show what you\'re talking about rather than just telling',
        "Use stories, metaphors, data, and brief authority signals in every video",
        "A watchable channel must come first; you can't convert viewers who don't exist or don't trust you"
      ),
      actionItems: bullets(
        "Audit your content plan: does it support all three stages?",
        'Identify ways to add "show" elements to your next videos',
        "Practise using metaphors and brief authority drops"
      ),
      sortOrder: 4,
      published: true,
      principleTags: ["show_dont_tell", "story_proof", "binge_architecture"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "The Client Journey and Building Trust", sortOrder: 4, description: "Map the three-stage client journey and learn four trust-building techniques that turn viewers into clients during the Consumption phase." },
  });

  // Section 3 — On-Camera Confidence (8 lessons)
  const l3_1 = await prisma.courseLesson.upsert({
    where: { slug: "finding-authentic-self" },
    create: {
      sectionId: s3.id,
      title: "Finding Your Authentic Self on Camera",
      slug: "finding-authentic-self",
      youtubeUrl: "https://youtu.be/oMbZzzeQdsw",
      description:
        "Jared normalises the awkwardness of being on camera and shares his own journey from stilted videos to a natural, personality-driven style. The core message: authenticity is discovered through volume, not planning, and every video raises your baseline.",
      keyTakeaways: bullets(
        "On-camera confidence comes only from doing reps — you can't plan your way to authenticity",
        "Every single video raises your baseline; trust the process",
        "Comparison kills joy — compare yourself only to your past self",
        "What viewers respond to is something slightly raw with refinedness and direction",
        "Know where your viewer starts emotionally and where you want to take them (to clarity)"
      ),
      actionItems: bullets(
        "Commit to shooting your first practice videos without waiting for perfection",
        "Watch your own past content and note what felt natural vs. forced",
        "Aim for videos over 8 minutes long"
      ),
      sortOrder: 1,
      published: true,
      principleTags: ["consistency"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Finding Your Authentic Self on Camera", sortOrder: 1, description: "Authenticity is discovered through volume, not planning. Learn why every video raises your baseline and how to embrace the awkward early stage." },
  });

  const l3_2 = await prisma.courseLesson.upsert({
    where: { slug: "connection-language" },
    create: {
      sectionId: s3.id,
      title: "Connection Language",
      slug: "connection-language",
      youtubeUrl: "https://youtu.be/gsu9H0PDvFY",
      description:
        'Introduces specific language patterns that build connection with viewers. Covers replacing "hey guys" with "I\'m glad you\'re here," eliminating "why" bombs, the contradiction pattern, and speaking at a Grade 5 level.',
      keyTakeaways: bullets(
        'Say "I\'m glad you\'re here" instead of "Hey guys" — you\'re speaking to one person',
        'Replace "why" with "the reason is" or "how come" — "why" bombs are disconnecting',
        'Replace "I feel like" with "it seems like" for genuine connection',
        "Use the contradiction pattern: validate, acknowledge, then share deeper insight",
        "Speak at a Grade 5 level — replace industry jargon with simple, relatable language"
      ),
      actionItems: bullets(
        "Identify your top 3–5 industry jargon terms and find plain-language replacements",
        'Practise removing "why" from your vocabulary in daily conversations',
        "Write out one contradiction pattern example relevant to your niche"
      ),
      sortOrder: 2,
      published: true,
      principleTags: ["connection_language", "grade_5_language", "values_peppering"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Connection Language", sortOrder: 2, description: "Replace generic phrases with language patterns that build real connection — from eliminating 'why' bombs to speaking at a Grade 5 level." },
  });

  const l3_3 = await prisma.courseLesson.upsert({
    where: { slug: "eighty-percent-rule" },
    create: {
      sectionId: s3.id,
      title: "80% Rule — Just Publish",
      slug: "eighty-percent-rule",
      youtubeUrl: "https://youtu.be/1E4lPdHJdxw",
      description:
        "Tackles perfectionism as the biggest obstacle to YouTube progress. Your 80% today will be far surpassed by your 80% in a year — your baseline keeps rising. While you wait for perfect, your competitors are publishing and getting leads.",
      keyTakeaways: bullets(
        "The 80% Rule: if your video is 80% of what you envisioned, hit publish",
        "While you wait for perfection, your competitors are publishing and getting leads",
        "Your 80% isn't static — what used to be aspirational becomes your new baseline",
        "Progress over perfection: every video teaches you something",
        "Do better in the next video rather than going back to fix what you already did"
      ),
      actionItems: bullets(
        "Adopt the 80% mindset for your next video — publish even if it's not perfect",
        "Expect your first 10–15 videos to be practice reps",
        "After publishing, note one thing to improve in the next video"
      ),
      sortOrder: 3,
      published: true,
      principleTags: ["consistency"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "80% Rule — Just Publish", sortOrder: 3, description: "Perfectionism is the biggest obstacle to YouTube progress. Your 80% today will be surpassed by your 80% in a year — just publish." },
  });

  const l3_4 = await prisma.courseLesson.upsert({
    where: { slug: "content-prep-batch-shooting" },
    create: {
      sectionId: s3.id,
      title: "Content Prep & Batch Shooting",
      slug: "content-prep-batch-shooting",
      youtubeUrl: "https://youtu.be/u1mMLBckJSk",
      description:
        "Breaks down the time investment for video creation: roughly 70% preparation and 30% shooting/editing. Covers how thorough preparation translates to on-camera confidence and introduces batch shooting for efficiency.",
      keyTakeaways: bullets(
        "70% of your video time should be preparation; only 30% is shooting and editing",
        "Before filming, map the emotional journey: where is the viewer starting, what clarity will you deliver?",
        "Research is what no one else is doing — 3–5 hours of unique data creates content nobody else has",
        "Batch shooting (filming 2–3 videos in one session) saves time and maintains creative flow",
        "A dedicated studio setup removes friction"
      ),
      actionItems: bullets(
        "Before your next video, write down: how is my avatar feeling about this topic, and what clarity will I give them?",
        "Plan your first batch shoot: research two topics in advance, then film both in one session",
        "Set up a simple dedicated shooting space"
      ),
      sortOrder: 4,
      published: true,
      principleTags: ["arc_attention", "arc_revelation", "show_dont_tell"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Content Prep & Batch Shooting", sortOrder: 4, description: "Thorough preparation drives on-camera confidence. Learn the 70/30 prep-to-shoot ratio and batch shooting for efficiency." },
  });

  const l3_5 = await prisma.courseLesson.upsert({
    where: { slug: "content-frameworks-psl-arc" },
    create: {
      sectionId: s3.id,
      title: "Content Frameworks PSL & ARC",
      slug: "content-frameworks-psl-arc",
      youtubeUrl: "https://youtu.be/_SI0xzFZTAY",
      description:
        "Introduces the two core content frameworks: PSL (Point, Story, Lesson) for simpler videos and ARC (Attention, Revelation, Connection) for deeper content. Walks through real examples showing hooks, curiosity bridges, and clean video endings.",
      keyTakeaways: bullets(
        "PSL: state your main message, tell a story, deliver the lesson — stackable for multi-point videos",
        "ARC: hook in the first 30 seconds, deliver revelations throughout, weave connection language throughout",
        "The hook must connect with the title and thumbnail — the first sentence must approve the click",
        "Never start a video talking about yourself — start by connecting with what the viewer is feeling",
        "Use curiosity bridges throughout and end with a fast recap, clear CTA, and card link"
      ),
      actionItems: bullets(
        "Write a PSL outline for a simple video topic",
        "Use the ARC Script Builder to script your next deeper video",
        "Watch 3–5 video endings to study the fast-recap pattern"
      ),
      sortOrder: 5,
      published: true,
      principleTags: [
        "arc_attention",
        "arc_revelation",
        "arc_connection",
        "approve_the_click",
        "curiosity_bridges",
        "lead_magnet",
        "connection_language",
      ],
      aiToolLink: "/member/ai-tools/arc-script-builder",
      aiToolLabel: "Write Your Script",
    },
    update: { title: "Content Frameworks PSL & ARC", sortOrder: 5, description: "Master the two core frameworks: PSL (Point, Story, Lesson) for simpler videos and ARC (Attention, Revelation, Connection) for deeper content." },
  });

  const l3_6 = await prisma.courseLesson.upsert({
    where: { slug: "how-to-present-on-camera" },
    create: {
      sectionId: s3.id,
      title: "How to Present on Camera",
      slug: "how-to-present-on-camera",
      youtubeUrl: "https://youtu.be/E4Qbnsumwuc",
      description:
        "Covers the physical mechanics of on-camera presentation: body positioning, eye contact with the lens, hand visibility, energy projection, and tonality. The camera absorbs energy, so you must bring 130% to land at 100% for the viewer.",
      keyTakeaways: bullets(
        "Be physically solid and always face the camera — imagine your avatar on the other side of the lens",
        "Keep hands visible and use open-palm gestures; people trust others more when they can see hands",
        "The camera sucks energy out — bring 130% energy to land at 100%",
        "Use tonality as if telling a fairy tale to a 2-year-old: vary pace, pauses, excitement",
        "Simple language isn't dumbing it down — it's respecting the viewer's time"
      ),
      actionItems: bullets(
        "Practise presenting with hands visible and open-palm gestures",
        "Record a test clip at normal energy, then re-record at 130% energy and compare",
        "Identify jargon in your recent content and replace with Grade 5 language"
      ),
      sortOrder: 6,
      published: true,
      principleTags: ["grade_5_language", "connection_language", "show_dont_tell"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "How to Present on Camera", sortOrder: 6, description: "The physical mechanics of great on-camera presence — body positioning, eye contact, energy projection, and why you need to bring 130% to land at 100%." },
  });

  const l3_7 = await prisma.courseLesson.upsert({
    where: { slug: "practical-tips-shooting" },
    create: {
      sectionId: s3.id,
      title: "Practical Tips for Shooting",
      slug: "practical-tips-shooting",
      youtubeUrl: "https://youtu.be/xgt14-955xI",
      description:
        "Practical production tips: using your phone for notes while filming, talking to your editor on-camera, multiple camera angles, building a B-roll library, voiceover techniques, and prioritising audio quality above all else.",
      keyTakeaways: bullets(
        "Keep bullet-point notes on your phone and glance at them while filming — don't memorise scripts",
        "Talk directly to your editor during filming to cut down revision rounds",
        "Use a B-camera on the shadow side for depth; even one camera with editor zooms works",
        "Audio is the single most important production element — invest in a microphone first",
        "Build a B-roll library over time; don't let gear perfectionism stop you from starting"
      ),
      actionItems: bullets(
        "Set up a simple note system with bullet points for your next shoot",
        "If you have an editor, try talking to them on-camera during your next video",
        "Invest in a quality wireless microphone as your first gear purchase"
      ),
      sortOrder: 7,
      published: true,
      principleTags: ["consistency"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Practical Tips for Shooting", sortOrder: 7, description: "Production tips that save time: using your phone for notes, talking to your editor on-camera, B-roll libraries, and why audio quality matters most." },
  });

  const l3_8 = await prisma.courseLesson.upsert({
    where: { slug: "get-in-your-reps" },
    create: {
      sectionId: s3.id,
      title: "Get in Your Reps — Homework",
      slug: "get-in-your-reps",
      youtubeUrl: "https://youtu.be/jjIqQkSBMdw",
      description:
        "A dedicated practice assignment: shoot a 6+ minute monologue answering five personal questions about your YouTube motivation, capacity, and vision. This builds the on-camera muscle and deepens group connection.",
      keyTakeaways: bullets(
        "This is about building a muscle, not creating publishable content",
        "Don't script word for word — use bullet points and trust yourself",
        "Aim for 80% — allow yourself to be imperfect",
        "Watch your recording back and notice what felt natural vs. forced",
        "Sharing with the group creates accountability and community"
      ),
      actionItems: bullets(
        "Shoot a 6+ minute monologue answering the five reflection questions",
        "Share the video in the community",
        "Watch it back and note what felt natural and what felt forced"
      ),
      sortOrder: 8,
      published: true,
      principleTags: ["consistency"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Get in Your Reps — Homework", sortOrder: 8, description: "Shoot a 6+ minute monologue answering five personal questions. This builds your on-camera muscle and deepens group connection." },
  });

  // Section 4 — Creation (5 lessons)
  const l4_1 = await prisma.courseLesson.upsert({
    where: { slug: "youtube-research" },
    create: {
      sectionId: s4.id,
      title: "How to Do YouTube Research",
      slug: "youtube-research",
      youtubeUrl: "https://youtu.be/idYvUZrm_CQ",
      description:
        "Hands-on YouTube research method: create a brand-new Gmail account, search keywords your avatar would search, watch top-performing videos at 2x speed, and train the algorithm to surface content your avatar sees.",
      keyTakeaways: bullets(
        "Create a fresh Gmail/YouTube account for avatar-perspective research",
        "Search avatar keywords, watch at 2x speed, and like videos to train the algorithm",
        "Take screenshots of compelling thumbnails and titles — build your idea library",
        "Look at bigger markets for content inspiration you can adapt",
        "Evaluate competitors' descriptions: note what they do well and what they're missing"
      ),
      actionItems: bullets(
        "Create a new Gmail account and begin YouTube research sessions",
        "Spend 15–20 minutes daily for one week training this account's algorithm",
        "Build a screenshot library of thumbnails and titles that grab your attention",
        "Identify 3–5 content gaps in your niche"
      ),
      sortOrder: 1,
      published: true,
      principleTags: ["themes_over_topics", "avatar_clarity"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "How to Do YouTube Research", sortOrder: 1, description: "Create a fresh Gmail account and train the algorithm to show you exactly what your avatar sees — then study what's already working." },
  });

  const l4_2 = await prisma.courseLesson.upsert({
    where: { slug: "arc-scripting-gpt" },
    create: {
      sectionId: s4.id,
      title: "ARC Scripting with Custom GPT",
      slug: "arc-scripting-gpt",
      youtubeUrl: "https://youtu.be/T0aLhInKBVU",
      description:
        "Live walkthrough of using the ARC Method custom GPT to build a full video script. Demonstrates the entire process from avatar definition through hook selection, revelation structure, and connection language layering.",
      keyTakeaways: bullets(
        "The ARC custom GPT walks you through: avatar definition, hook selection, revelation structure, and connection language",
        "Always correct the AI when it generates something inauthentic — don't accept generic output",
        "For listicle videos, lead with your second-best point first, then your best point second",
        "The revelation section should give each item a mini-journey: what, why, when, story proof, meaning",
        "Use curiosity bridges between sections to keep viewers moving through the video"
      ),
      actionItems: bullets(
        "Use the ARC custom GPT to script your next video from start to finish",
        "Upload your avatar document and research before starting",
        "Practise correcting the AI when it produces something that doesn't sound like you"
      ),
      sortOrder: 2,
      published: true,
      principleTags: [
        "arc_attention",
        "arc_revelation",
        "arc_connection",
        "approve_the_click",
        "curiosity_bridges",
        "lead_magnet",
        "story_proof",
        "connection_language",
      ],
      aiToolLink: "/member/ai-tools/arc-script-builder",
      aiToolLabel: "Write Your Script",
    },
    update: { title: "ARC Scripting with Custom GPT", sortOrder: 2, description: "Live walkthrough of using the ARC Method GPT to build a full video script, from avatar definition through hook selection and connection language." },
  });

  const l4_2a = await prisma.courseLesson.upsert({
    where: { slug: "arc-method-claude" },
    create: {
      sectionId: s4.id,
      title: "ARC Method for Claude",
      slug: "arc-method-claude",
      youtubeUrl: "https://youtu.be/d0iWMT3RqOw",
      description:
        "Hands-on walkthrough of setting up Claude as an ARC script writing tool using Projects. Demonstrates how to install Claude, create a project with the ARC Method framework and avatar document, upload research, and generate scripts or hooks.",
      keyTakeaways: bullets(
        "Download the Claude desktop app and use Projects to set up your ARC script writing environment",
        "Upload three things: the ARC Method framework file, your avatar document, and your research",
        "You can use Claude for full scripts or just hooks — ask for specific patterns (contradiction, confirmation, empathy, stakes)",
        "Feed it as much context as possible: research files, voice memo transcripts, your vision for viewer clarity",
        "Never just accept what Claude produces — read it from the viewer's perspective, edit it, mould it to sound like you"
      ),
      actionItems: bullets(
        "Download Claude desktop app and create an ARC Script Writing project",
        "Upload the ARC Method framework and your avatar document",
        "Try scripting your next video using Claude with uploaded research"
      ),
      sortOrder: 3,
      published: true,
      principleTags: [
        "arc_attention",
        "arc_revelation",
        "arc_connection",
        "curiosity_bridges",
        "connection_language",
      ],
      aiToolLink: "/member/ai-tools/arc-script-builder",
      aiToolLabel: "Write Your Script",
    },
    update: { title: "ARC Method for Claude", sortOrder: 3, description: "Set up Claude as your ARC script writing tool using Projects — install, configure with the framework and avatar doc, and generate scripts." },
  });

  const l4_3 = await prisma.courseLesson.upsert({
    where: { slug: "studio-setup" },
    create: {
      sectionId: s4.id,
      title: "Studio Setup",
      slug: "studio-setup",
      youtubeUrl: "https://youtu.be/mpVHMwzRFfo",
      description:
        "Practical walkthrough of studio and gear setup, from phone-only filming to a full multi-camera studio. Covers lighting diagrams, key light and hair light positioning, Log profiles for colour grading, and why audio quality matters most.",
      keyTakeaways: bullets(
        "Start with your phone — add a wireless mic as your first purchase",
        "Audio is the most important element; viewers tolerate imperfect visuals but not poor audio",
        "Lighting basics: key light slightly off-centre, hair light on the opposite side, B-camera on the shadow side",
        "Shoot in a Log profile for better colour grading in post-production",
        "Add depth: turn off overhead lights, use intentional key/hair lights, include colour elements in your background"
      ),
      actionItems: bullets(
        "Assess your current space: take photos and identify where to place key light, hair light, and camera",
        "If budget allows, purchase a wireless microphone as your first gear investment",
        "Set up your shooting space so you can film without setup overhead",
        "Bring photos of your space to Q&A for personalised setup advice"
      ),
      sortOrder: 4,
      published: true,
      principleTags: ["studio_setup"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Studio Setup", sortOrder: 4, description: "From phone-only filming to a full multi-camera studio — lighting diagrams, key light positioning, Log profiles, and why audio matters most." },
  });

  const l4_4 = await prisma.courseLesson.upsert({
    where: { slug: "your-first-two-videos" },
    create: {
      sectionId: s4.id,
      title: "Your First Two Videos",
      slug: "your-first-two-videos",
      youtubeUrl: "https://youtu.be/Ls_RciSsLuI",
      description:
        "Specific assignment for your first two publishable videos. Guides you to brainstorm 20 video ideas using title frameworks, select two topics from your primary theme, and script them using PSL or ARC.",
      keyTakeaways: bullets(
        "Your first two videos should be on emotionally charged, future-focused topics from your primary theme",
        "Brainstorm 20 video ideas using the title frameworks document, then pick two easy lifts",
        "Use odd numbers for listicles (3, 5, 7, 9) — odd numbers consistently outperform even numbers",
        "Use bullet points, not memorised scripts — trust yourself to fill in the gaps",
        "The 80% Rule applies: your first 10–15 videos are reps, not lead generators"
      ),
      actionItems: bullets(
        "Brainstorm 20 video ideas using the title frameworks document",
        "Select two topics from your primary theme and script them using PSL or ARC",
        "Shoot and publish both videos within the next two weeks",
        "After publishing, identify one improvement for your next video"
      ),
      sortOrder: 5,
      published: true,
      principleTags: [
        "themes_over_topics",
        "arc_attention",
        "arc_revelation",
        "consistency",
        "title_frameworks",
      ],
      aiToolLink: "/member/ai-tools/title-creator",
      aiToolLabel: "Generate Title Ideas",
    },
    update: { title: "Your First Two Videos", sortOrder: 5, description: "Brainstorm 20 video ideas using title frameworks, select two topics from your primary theme, and script them using PSL or ARC." },
  });

  // Section 5 — Packaging (3 lessons)
  const l5_1 = await prisma.courseLesson.upsert({
    where: { slug: "packaging-principle-tension" },
    create: {
      sectionId: s5.id,
      title: "Packaging Principle & Building Tension",
      slug: "packaging-principle-tension",
      youtubeUrl: "https://youtu.be/JJzxX2a4jp8",
      description:
        "Packaging (title, thumbnail, hook) is the most important element of the entire system — without it, even great content never gets seen. Introduces the dissonance principle: the title and thumbnail must create tension between them so viewers feel compelled to click.",
      keyTakeaways: bullets(
        "Packaging has three elements: title, thumbnail, and hook/intro — all three must work together",
        "The title and thumbnail should create dissonance (tension) between them",
        "Thumbnails: your face showing the emotion the viewer is feeling, simple words that create tension with the title, and a background image",
        "Use the Thumbnail & Title Analyzer to score and iterate on your packaging before publishing",
        "Include relevant keywords (city, niche, avatar descriptor) in titles for search discoverability"
      ),
      actionItems: bullets(
        "Run your next video's title and thumbnail through the Thumbnail & Title Analyzer",
        "Ensure there is clear dissonance/tension between your title and thumbnail text",
        "Take a set of facial expression photos showing different emotions"
      ),
      sortOrder: 1,
      published: true,
      principleTags: ["approve_the_click", "curiosity_bridges", "arc_attention", "title_frameworks"],
      aiToolLink: "/member/ai-tools/title-analyzer",
      aiToolLabel: "Analyse Your Packaging",
    },
    update: { title: "Packaging Principle & Building Tension", sortOrder: 1, description: "Without packaging, even great content never gets seen. Learn the dissonance principle — title and thumbnail must create tension that compels clicks." },
  });

  const l5_2 = await prisma.courseLesson.upsert({
    where: { slug: "creating-titles" },
    create: {
      sectionId: s5.id,
      title: "Creating Titles",
      slug: "creating-titles",
      youtubeUrl: "https://youtu.be/MwpOgBAB64E",
      description:
        "Hands-on demonstration of using the Title Creator to generate and refine video titles. Shows how to feed in a full script and iterate through framework-organised title options.",
      keyTakeaways: bullets(
        "Feed your full script or research into the Title Creator to generate framework-organised options",
        "Title frameworks include: myth-busting, pros and cons, data urgency, and others",
        "Always include a keyword that identifies your avatar or niche",
        "Use the Thumbnail & Title Analyzer separately for dissonance-creating thumbnail text",
        "AB testing titles only makes sense once you have enough views; early on, just pick the strongest option"
      ),
      actionItems: bullets(
        "Use the Title Creator on your next video's script to generate 10+ options",
        "Select a title that includes your avatar keyword and has clear emotional tension",
        "Generate matching thumbnail text using the Thumbnail & Title Analyzer"
      ),
      sortOrder: 2,
      published: true,
      principleTags: ["title_frameworks", "approve_the_click", "curiosity_bridges", "arc_attention"],
      aiToolLink: "/member/ai-tools/title-creator",
      aiToolLabel: "Generate Title Ideas",
    },
    update: { title: "Creating Titles", sortOrder: 2, description: "Hands-on demonstration of using the Title Creator to generate and refine video titles from your full script through framework-organised options." },
  });

  const l5_3 = await prisma.courseLesson.upsert({
    where: { slug: "building-thumbnails" },
    create: {
      sectionId: s5.id,
      title: "Building Thumbnails",
      slug: "building-thumbnails",
      youtubeUrl: "https://youtu.be/leeGb8rmxl8",
      description:
        "Walks through the Canva-based thumbnail creation process with templates and live edits. Covers the three essential thumbnail elements and analyses thumbnails from successful channels across different niches.",
      keyTakeaways: bullets(
        "Every thumbnail needs three elements: your face with emotion, short dissonance text, and a contextual background",
        "Make sure the whites of your eyes are visible even at phone size",
        "Use Canva templates: gradient overlays for depth, slightly blur the background, complementary colours",
        "Your background can be as simple as your studio/office",
        "Study thumbnails from successful channels in your niche for inspiration"
      ),
      actionItems: bullets(
        "Create or obtain a set of 5–10 facial expression photos",
        "Build a Canva thumbnail template with face, text area, and background slot",
        "Design thumbnails for your next two videos using the three-element framework",
        "Screenshot 10 compelling thumbnails from successful channels for inspiration"
      ),
      sortOrder: 3,
      published: true,
      principleTags: ["approve_the_click", "show_dont_tell"],
      aiToolLink: "/member/ai-tools/title-analyzer",
      aiToolLabel: "Analyse Your Packaging",
    },
    update: { title: "Building Thumbnails", sortOrder: 3, description: "Canva-based thumbnail creation with templates — the three essential thumbnail elements and analysis of thumbnails from successful channels." },
  });

  // Section 6 — Your First 10 Videos (1 lesson, workbook only)
  const l6_1 = await prisma.courseLesson.upsert({
    where: { slug: "first-10-videos-planning" },
    create: {
      sectionId: s6.id,
      title: "Your First 10 Videos — Planning",
      slug: "first-10-videos-planning",
      youtubeUrl: null,
      description:
        "Now that you've completed the Foundations course, it's time to plan your first 10 videos strategically. This workbook section helps you brainstorm by theme, select topics, draft titles, and set a realistic publishing schedule.",
      keyTakeaways: null,
      actionItems: null,
      sortOrder: 1,
      published: true,
      principleTags: ["consistency", "themes_over_topics", "title_frameworks"],
      aiToolLink: null,
      aiToolLabel: null,
    },
    update: { title: "Your First 10 Videos — Planning", sortOrder: 1, description: "Plan your first 10 videos strategically — brainstorm by theme, select topics, draft titles, and set a realistic publishing schedule." },
  });

  console.log("✓ Lessons created (22 total)");

  // ── Workbook Fields ────────────────────────────────────────────────────────────

  async function seedFields(
    lessonId: string,
    fields: Array<{
      fieldType: string;
      label: string;
      placeholderText?: string;
      config?: object;
    }>
  ) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await prisma.lessonWorkbookField.upsert({
        where: {
          // Use a stable composite — we don't have a unique constraint so we'll
          // rely on create-or-skip via a generated "label key"
          id: `${lessonId}-field-${i + 1}`,
        },
        create: {
          id: `${lessonId}-field-${i + 1}`,
          lessonId,
          fieldType: f.fieldType,
          label: f.label,
          placeholderText: f.placeholderText ?? null,
          sortOrder: i + 1,
          config: f.config ?? undefined,
        },
        update: {
          fieldType: f.fieldType,
          label: f.label,
          placeholderText: f.placeholderText ?? null,
          sortOrder: i + 1,
          config: f.config ?? undefined,
        },
      });
    }
  }

  // Section 1 — "Your Why — Workbook"
  await seedFields(l1_1.id, [
    { fieldType: "long_text", label: "What do you want your business to look like in 3 years?" },
    { fieldType: "long_text", label: "What do you want your daily life to feel like?" },
    { fieldType: "long_text", label: "Why does YouTube matter for getting there?" },
    {
      fieldType: "checklist",
      label: "When my video gets low views, I will:",
      config: {
        items: [
          "Remind myself this is a long game",
          "Review what I can improve next time",
          "Look at my purpose statement",
          "Focus on serving my avatar, not chasing views",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "When I don't feel like filming, I will:",
      config: {
        items: [
          "Remind myself of my commitment",
          "Film anyway, even if it's shorter",
          "Revisit why I started",
          "Set up my space and just press record",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "When I hate how I look/sound on camera, I will:",
      config: {
        items: [
          "Remember that 80% is enough",
          "Watch my earliest video to see progress",
          "Focus on helping my avatar, not judging myself",
          "Keep going — every video raises my baseline",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "When I want to quit entirely, I will:",
      config: {
        items: [
          "Read my commitment statement",
          "Talk to my accountability partner",
          "Watch a video from someone I've helped",
          "Remember: the people who quit never find out what would have happened",
        ],
      },
    },
    { fieldType: "long_text", label: "My Commitment Statement", config: { rows: 6 } },
    { fieldType: "short_text", label: "Signature" },
    { fieldType: "short_text", label: "Date" },
  ]);

  // Section 2 — Lesson 2.2: "Who Do You Want"
  await seedFields(l2_2.id, [
    { fieldType: "short_text", label: "They are:" },
    { fieldType: "short_text", label: "They want:" },
    { fieldType: "short_text", label: "They're afraid of:" },
    { fieldType: "long_text", label: "What keeps them awake at 2 a.m.?" },
    { fieldType: "long_text", label: "What mistakes do they keep making?" },
    { fieldType: "long_text", label: "What do they wish they knew sooner?" },
    { fieldType: "long_text", label: "What does working with people like you give them?" },
  ]);

  // Section 2 — Lesson 2.3: "Finding Your Themes"
  await seedFields(l2_3.id, [
    { fieldType: "long_text", label: "1. What questions do they ask in the first 10 minutes of meeting you?" },
    { fieldType: "long_text", label: "2. What mistakes do you see them making over and over?" },
    { fieldType: "long_text", label: "3. What keeps them awake at 2 a.m.?" },
    { fieldType: "long_text", label: "4. What makes them say 'I wish I knew that sooner'?" },
    { fieldType: "long_text", label: "5. What problems are you constantly solving for them?" },
    { fieldType: "short_text", label: "Theme 1:" },
    { fieldType: "short_text", label: "Theme 2:" },
    { fieldType: "short_text", label: "Theme 3 (optional):" },
    {
      fieldType: "checklist",
      label: "Session 1 Checklist",
      config: {
        items: [
          "Completed the 'What Do You Want' goal-setting exercise",
          "Built or refined my avatar using the Avatar Architect",
          "Identified 1–3 content themes from avatar questions",
          "Understand the three-stage client journey",
          "Ready to start positioning my channel",
        ],
      },
    },
  ]);

  // Section 3 — Lesson 3.1: "Finding Your Authentic Self on Camera"
  await seedFields(l3_1.id, [
    {
      fieldType: "long_text",
      label: "What are 3 personal interests/hobbies that you could naturally mention in your videos?",
      config: { rows: 4 },
    },
    {
      fieldType: "long_text",
      label: "What values do you want to 'pepper in' to your videos?",
      config: { rows: 4 },
    },
  ]);

  // Section 3 — Lesson 3.2: "Connection Language"
  await seedFields(l3_2.id, [
    {
      fieldType: "long_text",
      label: "Write Your Contradiction Pattern: 'It makes sense that you'd think _______. However, _______.'",
      config: { rows: 4 },
    },
  ]);

  // Section 3 — Lesson 3.3: "80% Rule"
  await seedFields(l3_3.id, [
    { fieldType: "short_text", label: "I commit to publishing at 80%. Signature:" },
    { fieldType: "short_text", label: "Date" },
  ]);

  // Section 3 — Lesson 3.8: "Get in Your Reps"
  await seedFields(l3_8.id, [
    {
      fieldType: "checklist",
      label: "Session 2 Checklist",
      config: {
        items: [
          "Committed to shooting practice videos without perfectionism",
          "Identified and practised connection language patterns",
          "Adopted the 80% Rule mindset",
          "Planned my first batch shooting session",
          "Understand PSL and ARC content frameworks",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "Homework",
      config: {
        items: [
          "Shot a 6+ minute monologue answering the five questions",
          "Shared the video in the community",
          "Watched it back and noted what felt natural vs. forced",
        ],
      },
    },
  ]);

  // Section 4 — Lesson 4.1: "How to Do YouTube Research"
  await seedFields(l4_1.id, [
    {
      fieldType: "checklist",
      label: "Research Setup",
      config: {
        items: [
          "Created a new Gmail account for avatar research",
          "Installed Keywords Everywhere extension",
          "Installed VidIQ extension",
        ],
      },
    },
    {
      fieldType: "long_text",
      label: "Write down 3 titles that are ranking well in your niche:",
      config: { rows: 4 },
    },
    {
      fieldType: "long_text",
      label: "Write down 3 observations about thumbnails in your niche:",
      config: { rows: 4 },
    },
  ]);

  // Section 4 — Lesson 4.4: "Your First Two Videos"
  await seedFields(l4_4.id, [
    { fieldType: "short_text", label: "Theme:" },
    { fieldType: "short_text", label: "Topic:" },
    { fieldType: "long_text", label: "Why this is an 'easy lift' for me:" },
    { fieldType: "long_text", label: "A — Attention: Hook that approves the click" },
    { fieldType: "long_text", label: "Brief credibility mention" },
    { fieldType: "short_text", label: "Lead magnet mention (if you have one):" },
    { fieldType: "long_text", label: "R — Revelation: Main points to cover", config: { rows: 6 } },
    { fieldType: "long_text", label: "C — Connection: Where can I use connection language?" },
    { fieldType: "long_text", label: "Show Don't Tell — A chart or graph:" },
    { fieldType: "long_text", label: "Show Don't Tell — A map or location:" },
    { fieldType: "long_text", label: "Show Don't Tell — Something you draw/write:" },
    {
      fieldType: "checklist",
      label: "Session 3 Checklist",
      config: {
        items: [
          "Completed YouTube research with fresh Gmail account",
          "Scripted at least one video using ARC or PSL",
          "Set up or improved studio/shooting space",
          "Published (or planned) first two videos",
          "Understand the packaging principle",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "Homework",
      config: {
        items: [
          "Filmed and published first video",
          "Filmed and published second video",
          "Identified one improvement for next video",
        ],
      },
    },
  ]);

  // Section 5 — Lesson 5.1: "Packaging Principle & Building Tension"
  await seedFields(l5_1.id, [
    {
      fieldType: "long_text",
      label: "Title Brainstorm: Generate 5 title options",
      config: { rows: 6 },
    },
    {
      fieldType: "checklist",
      label: "Title Quality Check",
      config: {
        items: [
          "Includes searchable keywords",
          "Creates emotional tension or curiosity",
          "Speaks directly to my avatar",
        ],
      },
    },
  ]);

  // Section 5 — Lesson 5.2: "Creating Titles"
  await seedFields(l5_2.id, [
    {
      fieldType: "table",
      label: "Title Framework Cheat Sheet",
      config: {
        columns: [
          { key: "framework", label: "Framework", type: "text" },
          { key: "your_version", label: "Your Version", type: "text" },
        ],
        rowCount: 12,
        prefillRows: [
          { framework: "Myth-Busting", your_version: "" },
          { framework: "Pros and Cons", your_version: "" },
          { framework: "Data Urgency", your_version: "" },
          { framework: "Question Hook", your_version: "" },
          { framework: "How-To", your_version: "" },
          { framework: "Listicle", your_version: "" },
          { framework: "Story Hook", your_version: "" },
          { framework: "Contrast", your_version: "" },
          { framework: "Authority", your_version: "" },
          { framework: "Fear/Risk", your_version: "" },
          { framework: "Aspirational", your_version: "" },
          { framework: "Niche-Specific", your_version: "" },
        ],
      },
    },
  ]);

  // Section 5 — Lesson 5.3: "Building Thumbnails"
  await seedFields(l5_3.id, [
    {
      fieldType: "checklist",
      label: "What emotion will my viewer feel?",
      config: { items: ["Curious", "Nervous", "Excited", "Skeptical"] },
    },
    { fieldType: "short_text", label: "My face should show:" },
    { fieldType: "short_text", label: "1-3 words for the thumbnail:" },
    { fieldType: "short_text", label: "Background idea:" },
    {
      fieldType: "checklist",
      label: "Session 4 Checklist",
      config: {
        items: [
          "Ran titles through the Title Creator",
          "Analysed packaging with the Thumbnail & Title Analyzer",
          "Created thumbnail with face + text + background",
          "Understand dissonance principle between title and thumbnail",
          "Have a set of facial expression photos ready",
        ],
      },
    },
    {
      fieldType: "checklist",
      label: "Homework",
      config: {
        items: [
          "Created thumbnails for next two videos",
          "Built a Canva thumbnail template",
          "Screenshot 10 inspiring thumbnails from other channels",
          "Designed final packaging (title + thumbnail + hook) for next video",
        ],
      },
    },
  ]);

  // Section 6 — "Your First 10 Videos — Planning"
  await seedFields(l6_1.id, [
    { fieldType: "short_text", label: "My realistic starting pace: videos per month" },
    { fieldType: "short_text", label: "My shoot day each week/month:" },
    { fieldType: "short_text", label: "Theme 1 name:" },
    {
      fieldType: "table",
      label: "Brainstorm by Theme 1",
      config: {
        columns: [
          { key: "number", label: "#", type: "text" },
          { key: "video_idea", label: "Video Idea", type: "text" },
        ],
        rowCount: 5,
      },
    },
    { fieldType: "short_text", label: "Theme 2 name:" },
    {
      fieldType: "table",
      label: "Brainstorm by Theme 2",
      config: {
        columns: [
          { key: "number", label: "#", type: "text" },
          { key: "video_idea", label: "Video Idea", type: "text" },
        ],
        rowCount: 5,
      },
    },
    { fieldType: "short_text", label: "Theme 3 name:" },
    {
      fieldType: "table",
      label: "Brainstorm by Theme 3",
      config: {
        columns: [
          { key: "number", label: "#", type: "text" },
          { key: "video_idea", label: "Video Idea", type: "text" },
        ],
        rowCount: 5,
      },
    },
    {
      fieldType: "table",
      label: "Your First 10 Videos Plan",
      config: {
        columns: [
          { key: "number", label: "#", type: "text" },
          { key: "theme", label: "Theme", type: "text" },
          { key: "topic", label: "Topic", type: "text" },
          { key: "title_idea", label: "Title Idea", type: "text" },
          { key: "shoot_date", label: "Shoot Date", type: "text" },
        ],
        rowCount: 10,
      },
    },
  ]);

  console.log("✓ Workbook fields seeded");

  // ── Verification ──────────────────────────────────────────────────────────────
  const sectionCount = await prisma.courseSection.count();
  const lessonCount = await prisma.courseLesson.count();
  const fieldCount = await prisma.lessonWorkbookField.count();
  console.log(`\n✅ Done!`);
  console.log(`   Sections: ${sectionCount} (expected 6)`);
  console.log(`   Lessons:  ${lessonCount} (expected 22)`);
  console.log(`   Fields:   ${fieldCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
