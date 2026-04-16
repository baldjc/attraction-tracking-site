import prisma from "../src/lib/prisma";

const PRINCIPLES = [
  { slug: "avatar_clarity",      name: "Avatar Clarity",       colorLight: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { slug: "themes_over_topics",  name: "Themes Over Topics",    colorLight: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { slug: "lead_magnet",         name: "Lead Magnet",           colorLight: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { slug: "arc_attention",       name: "ARC Attention",         colorLight: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { slug: "arc_revelation",      name: "ARC Revelation",        colorLight: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { slug: "arc_connection",      name: "ARC Connection",        colorLight: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  { slug: "connection_language", name: "Connection Language",   colorLight: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  { slug: "approve_the_click",   name: "Approve the Click",     colorLight: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { slug: "title_frameworks",    name: "Title Frameworks",      colorLight: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { slug: "curiosity_bridges",   name: "Curiosity Bridges",     colorLight: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { slug: "binge_architecture",  name: "Binge Architecture",    colorLight: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { slug: "consistency",         name: "Consistency",           colorLight: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { slug: "values_peppering",    name: "Values Peppering",      colorLight: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300" },
  { slug: "grade_5_language",    name: "Grade 5 Language",      colorLight: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  { slug: "story_proof",         name: "Story Proof",           colorLight: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  { slug: "show_dont_tell",      name: "Show Don't Tell",       colorLight: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" },
  { slug: "studio_setup",        name: "Studio Setup",          colorLight: "bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300" },
];

async function main() {
  console.log("Seeding principles…");
  for (let i = 0; i < PRINCIPLES.length; i++) {
    const p = PRINCIPLES[i];
    const result = await prisma.principle.upsert({
      where: { slug: p.slug },
      update: { name: p.name, colorLight: p.colorLight, sortOrder: i },
      create: { slug: p.slug, name: p.name, colorLight: p.colorLight, sortOrder: i, isActive: true },
    });
    console.log(`  ${result.isActive ? "✓" : "○"} [${i}] ${result.name}`);
  }
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
