import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const NEON_URL =
  "postgresql://neondb_owner:npg_A0Xneoz5xFhd@ep-odd-dream-amrl8l3f-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const connectionString = process.env.NEON_DATABASE_URL?.replace(/\s+/g, "") ?? NEON_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const descriptions: Record<string, string> = {
  "your-why-workbook":
    "Define your purpose, set commitment boundaries, and build accountability before diving into content creation.",
  "what-do-you-want":
    "Move beyond SMART goals and clarify what you genuinely want from your YouTube journey — rooted in who you're becoming, not external metrics.",
  "who-do-you-want":
    "Define a single perfect client avatar so your content speaks directly to one person instead of being generic and forgettable.",
  "finding-your-themes":
    "Identify repeatable content themes from your avatar's questions — 1 to 3 core buckets that sustain a consistent publishing schedule indefinitely.",
  "client-journey-building-trust":
    "Map the three-stage client journey and learn four trust-building techniques that turn viewers into clients during the Consumption phase.",
  "finding-authentic-self":
    "Authenticity is discovered through volume, not planning. Learn why every video raises your baseline and how to embrace the awkward early stage.",
  "connection-language":
    "Replace generic phrases with language patterns that build real connection — from eliminating 'why' bombs to speaking at a Grade 5 level.",
  "eighty-percent-rule":
    "Perfectionism is the biggest obstacle to YouTube progress. Your 80% today will be surpassed by your 80% in a year — just publish.",
  "content-prep-batch-shooting":
    "Thorough preparation drives on-camera confidence. Learn the 70/30 prep-to-shoot ratio and batch shooting for efficiency.",
  "content-frameworks-psl-arc":
    "Master the two core frameworks: PSL (Point, Story, Lesson) for simpler videos and ARC (Attention, Revelation, Connection) for deeper content.",
  "how-to-present-on-camera":
    "The physical mechanics of great on-camera presence — body positioning, eye contact, energy projection, and why you need to bring 130% to land at 100%.",
  "practical-tips-shooting":
    "Production tips that save time: using your phone for notes, talking to your editor on-camera, B-roll libraries, and why audio quality matters most.",
  "get-in-your-reps":
    "Shoot a 6+ minute monologue answering five personal questions. This builds your on-camera muscle and deepens group connection.",
  "youtube-research":
    "Create a fresh Gmail account and train the algorithm to show you exactly what your avatar sees — then study what's already working.",
  "arc-scripting-gpt":
    "Live walkthrough of using the ARC Method GPT to build a full video script, from avatar definition through hook selection and connection language.",
  "arc-method-claude":
    "Set up Claude as your ARC script writing tool using Projects — install, configure with the framework and avatar doc, and generate scripts.",
  "studio-setup":
    "From phone-only filming to a full multi-camera studio — lighting diagrams, key light positioning, Log profiles, and why audio matters most.",
  "your-first-two-videos":
    "Brainstorm 20 video ideas using title frameworks, select two topics from your primary theme, and script them using PSL or ARC.",
  "packaging-principle-tension":
    "Without packaging, even great content never gets seen. Learn the dissonance principle — title and thumbnail must create tension that compels clicks.",
  "creating-titles":
    "Hands-on demonstration of using the Title Creator to generate and refine video titles from your full script through framework-organised options.",
  "building-thumbnails":
    "Canva-based thumbnail creation with templates — the three essential thumbnail elements and analysis of thumbnails from successful channels.",
  "first-10-videos-planning":
    "Plan your first 10 videos strategically — brainstorm by theme, select topics, draft titles, and set a realistic publishing schedule.",
};

async function main() {
  console.log("Updating lesson descriptions…");
  let updated = 0;
  for (const [slug, description] of Object.entries(descriptions)) {
    const result = await prisma.courseLesson.updateMany({
      where: { slug },
      data: { description },
    });
    if (result.count > 0) {
      console.log(`  ✓ ${slug}`);
      updated++;
    } else {
      console.warn(`  ✗ not found: ${slug}`);
    }
  }
  console.log(`\nDone — updated ${updated} lessons.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
