import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const PRODUCTION_FEATURES = [
  "Professional editing, graphics, titles, and b-roll",
  "Music and asset licensing",
  "Upload to Frame.io for review",
  "2–3 revisions per video",
  "Onboarding call to customise to your brand",
];

const JARED_HIGHLIGHTS = [
  "Comprehensive review of shooting, setup, and delivery",
  "Editing suggestions delivered in Frame.io",
  "Ideas for future content improvements",
  "15-minute coaching call",
];

const GROWTH_FEATURES = [
  "Full funnel built at launch",
  "Lead magnet strategy and setup",
  "Monthly strategy session with Jared",
  "Content calendar planning",
];

const DWU_FEATURES = [
  "Unlimited video edits (no monthly cap)",
  "Full YouTube channel management",
  "Thumbnail design and A/B testing",
  "SEO optimisation, descriptions, and publishing",
  "Weekly performance reporting",
];

const DWU_HIGHLIGHTS = [
  "4 long-form video edits per month",
  "2 full funnels built at launch",
  "Ready-to-film scripts researched and written for you",
];

async function main() {
  console.log("Seeding service categories and packages...");

  // ── Category 1: Production ──────────────────────────────────
  const production = await prisma.serviceCategory.upsert({
    where: { slug: "production" },
    update: {
      name: "Production",
      description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.",
      icon: "FilmIcon",
      accentColour: "blue",
      emoji: "🎬",
      tagline: "We edit. You publish.",
      highlighted: false,
      includesRef: null,
      addonLabel: "Add Jared's personal feedback",
      addonPriceNote: "1-on-1 coaching call + video-by-video review",
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: null,
      cardExtras: null,
      sortOrder: 1,
      published: true,
    },
    create: {
      name: "Production",
      slug: "production",
      description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.",
      icon: "FilmIcon",
      accentColour: "blue",
      emoji: "🎬",
      tagline: "We edit. You publish.",
      highlighted: false,
      includesRef: null,
      addonLabel: "Add Jared's personal feedback",
      addonPriceNote: "1-on-1 coaching call + video-by-video review",
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: null,
      cardExtras: null,
      sortOrder: 1,
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "editing-1" },
    update: {
      categoryId: production.id,
      name: "Production 2",
      price: "$500/mo",
      priceNote: "USD",
      priceAmount: 50000,
      videoCount: 2,
      isAddonVariant: false,
      badge: null,
      subtitle: null,
      sortOrder: 1,
      features: PRODUCTION_FEATURES,
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k",
      published: true,
    },
    create: {
      id: "editing-1",
      categoryId: production.id,
      name: "Production 2",
      price: "$500/mo",
      priceNote: "USD",
      priceAmount: 50000,
      videoCount: 2,
      isAddonVariant: false,
      badge: null,
      subtitle: null,
      sortOrder: 1,
      features: PRODUCTION_FEATURES,
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k",
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "editing-2" },
    update: {
      categoryId: production.id,
      name: "Production 2 + Jared",
      price: "$800/mo",
      priceNote: "USD",
      priceAmount: 80000,
      videoCount: 2,
      isAddonVariant: true,
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 2,
      features: PRODUCTION_FEATURES,
      highlightFeatures: JARED_HIGHLIGHTS,
      stripeUrl: "https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l",
      published: true,
    },
    create: {
      id: "editing-2",
      categoryId: production.id,
      name: "Production 2 + Jared",
      price: "$800/mo",
      priceNote: "USD",
      priceAmount: 80000,
      videoCount: 2,
      isAddonVariant: true,
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 2,
      features: PRODUCTION_FEATURES,
      highlightFeatures: JARED_HIGHLIGHTS,
      stripeUrl: "https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l",
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "editing-3" },
    update: {
      categoryId: production.id,
      name: "Production 4",
      price: "$1,000/mo",
      priceNote: "USD",
      priceAmount: 100000,
      videoCount: 4,
      isAddonVariant: false,
      badge: null,
      subtitle: null,
      sortOrder: 3,
      features: PRODUCTION_FEATURES,
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m",
      published: true,
    },
    create: {
      id: "editing-3",
      categoryId: production.id,
      name: "Production 4",
      price: "$1,000/mo",
      priceNote: "USD",
      priceAmount: 100000,
      videoCount: 4,
      isAddonVariant: false,
      badge: null,
      subtitle: null,
      sortOrder: 3,
      features: PRODUCTION_FEATURES,
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m",
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "editing-4" },
    update: {
      categoryId: production.id,
      name: "Production 4 + Jared",
      price: "$1,600/mo",
      priceNote: "USD",
      priceAmount: 160000,
      videoCount: 4,
      isAddonVariant: true,
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 4,
      features: PRODUCTION_FEATURES,
      highlightFeatures: JARED_HIGHLIGHTS,
      stripeUrl: "https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n",
      published: true,
    },
    create: {
      id: "editing-4",
      categoryId: production.id,
      name: "Production 4 + Jared",
      price: "$1,600/mo",
      priceNote: "USD",
      priceAmount: 160000,
      videoCount: 4,
      isAddonVariant: true,
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 4,
      features: PRODUCTION_FEATURES,
      highlightFeatures: JARED_HIGHLIGHTS,
      stripeUrl: "https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n",
      published: true,
    },
  });

  // ── Category 2: Growth ──────────────────────────────────────
  const growth = await prisma.serviceCategory.upsert({
    where: { slug: "growth" },
    update: {
      name: "Growth",
      description: "The full system built with you. Everything in Production plus strategy, funnels, coaching, and implementation.",
      icon: "RocketLaunchIcon",
      accentColour: "slate",
      emoji: "📈",
      tagline: "Editing + strategy + funnels.",
      highlighted: true,
      includesRef: "Includes everything in Production, plus:",
      addonLabel: null,
      addonPriceNote: null,
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: "Jared's feedback included",
      cardExtras: null,
      sortOrder: 2,
      published: true,
    },
    create: {
      name: "Growth",
      slug: "growth",
      description: "The full system built with you. Everything in Production plus strategy, funnels, coaching, and implementation.",
      icon: "RocketLaunchIcon",
      accentColour: "slate",
      emoji: "📈",
      tagline: "Editing + strategy + funnels.",
      highlighted: true,
      includesRef: "Includes everything in Production, plus:",
      addonLabel: null,
      addonPriceNote: null,
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: "Jared's feedback included",
      cardExtras: null,
      sortOrder: 2,
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "mastery-1" },
    update: {
      categoryId: growth.id,
      name: "Growth 2",
      price: "$1,995/mo",
      priceNote: "USD",
      priceAmount: 199500,
      videoCount: 2,
      isAddonVariant: false,
      badge: null,
      subtitle: "2 long-form video edits/mo",
      sortOrder: 1,
      features: GROWTH_FEATURES,
      highlightFeatures: ["2 long-form video edits per month", "1 full funnel built at launch"],
      stripeUrl: "https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q",
      published: true,
    },
    create: {
      id: "mastery-1",
      categoryId: growth.id,
      name: "Growth 2",
      price: "$1,995/mo",
      priceNote: "USD",
      priceAmount: 199500,
      videoCount: 2,
      isAddonVariant: false,
      badge: null,
      subtitle: "2 long-form video edits/mo",
      sortOrder: 1,
      features: GROWTH_FEATURES,
      highlightFeatures: ["2 long-form video edits per month", "1 full funnel built at launch"],
      stripeUrl: "https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q",
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "mastery-2" },
    update: {
      categoryId: growth.id,
      name: "Growth 4",
      price: "$2,995/mo",
      priceNote: "USD",
      priceAmount: 299500,
      videoCount: 4,
      isAddonVariant: false,
      badge: "Most Comprehensive",
      subtitle: "4 long-form video edits/mo",
      sortOrder: 2,
      features: GROWTH_FEATURES,
      highlightFeatures: ["4 long-form video edits per month", "2 full funnels built at launch"],
      stripeUrl: "https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r",
      published: true,
    },
    create: {
      id: "mastery-2",
      categoryId: growth.id,
      name: "Growth 4",
      price: "$2,995/mo",
      priceNote: "USD",
      priceAmount: 299500,
      videoCount: 4,
      isAddonVariant: false,
      badge: "Most Comprehensive",
      subtitle: "4 long-form video edits/mo",
      sortOrder: 2,
      features: GROWTH_FEATURES,
      highlightFeatures: ["4 long-form video edits per month", "2 full funnels built at launch"],
      stripeUrl: "https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r",
      published: true,
    },
  });

  // ── Category 3: Done With You ───────────────────────────────
  const dwy = await prisma.serviceCategory.upsert({
    where: { slug: "done-with-you" },
    update: {
      name: "Done With You",
      description: "You show up, film, and close deals. We do literally everything else.",
      icon: "SparklesIcon",
      accentColour: "purple",
      emoji: "💎",
      tagline: "You film and close deals. We build your entire YouTube engine.",
      highlighted: false,
      includesRef: "Includes everything in Growth, plus:",
      addonLabel: null,
      addonPriceNote: null,
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: null,
      cardExtras: [
        "We own your entire content pipeline — from raw footage to live video",
        "You get back 15–20+ hours per month to focus on clients",
        "Your channel never misses a week, even when life gets busy",
      ],
      sortOrder: 3,
      published: true,
    },
    create: {
      name: "Done With You",
      slug: "done-with-you",
      description: "You show up, film, and close deals. We do literally everything else.",
      icon: "SparklesIcon",
      accentColour: "purple",
      emoji: "💎",
      tagline: "You film and close deals. We build your entire YouTube engine.",
      highlighted: false,
      includesRef: "Includes everything in Growth, plus:",
      addonLabel: null,
      addonPriceNote: null,
      footerNote: "Added to your Foundations membership",
      jaredIncludedNote: null,
      cardExtras: [
        "We own your entire content pipeline — from raw footage to live video",
        "You get back 15–20+ hours per month to focus on clients",
        "Your channel never misses a week, even when life gets busy",
      ],
      sortOrder: 3,
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "ultimate-1" },
    update: {
      categoryId: dwy.id,
      name: "Done With You",
      price: "$4,500/mo",
      priceNote: "USD",
      priceAmount: 450000,
      videoCount: null,
      isAddonVariant: false,
      badge: "Full Service",
      subtitle: null,
      sortOrder: 1,
      features: DWU_FEATURES,
      highlightFeatures: DWU_HIGHLIGHTS,
      stripeUrl: null,
      published: true,
    },
    create: {
      id: "ultimate-1",
      categoryId: dwy.id,
      name: "Done With You",
      price: "$4,500/mo",
      priceNote: "USD",
      priceAmount: 450000,
      videoCount: null,
      isAddonVariant: false,
      badge: "Full Service",
      subtitle: null,
      sortOrder: 1,
      features: DWU_FEATURES,
      highlightFeatures: DWU_HIGHLIGHTS,
      stripeUrl: null,
      published: true,
    },
  });

  // ── Category 4: Add-Ons (unchanged) ────────────────────────
  const addons = await prisma.serviceCategory.upsert({
    where: { slug: "add-ons" },
    update: {
      name: "Add-Ons",
      description: "Available extras to complement your package.",
      icon: "PuzzlePieceIcon",
      accentColour: "gray",
      emoji: null,
      tagline: null,
      highlighted: false,
      includesRef: null,
      addonLabel: null,
      addonPriceNote: null,
      footerNote: null,
      jaredIncludedNote: null,
      cardExtras: null,
      sortOrder: 4,
      published: true,
    },
    create: {
      name: "Add-Ons",
      slug: "add-ons",
      description: "Available extras to complement your package.",
      icon: "PuzzlePieceIcon",
      accentColour: "gray",
      emoji: null,
      tagline: null,
      highlighted: false,
      includesRef: null,
      addonLabel: null,
      addonPriceNote: null,
      footerNote: null,
      jaredIncludedNote: null,
      cardExtras: null,
      sortOrder: 4,
      published: true,
    },
  });

  const addonPackages = [
    {
      id: "addon-1",
      name: "Custom Thumbnails",
      price: "$100 – $150",
      priceNote: null,
      priceAmount: null,
      videoCount: null,
      isAddonVariant: false,
      badge: null,
      subtitle: "$100 with Editing/Mastery, $150 standalone",
      sortOrder: 1,
      features: ["Professional, click-worthy thumbnails designed for your brand and audience"],
      highlightFeatures: null,
      stripeUrl: null,
    },
    {
      id: "addon-2",
      name: "Lead Magnet Creation",
      price: "~$1,000 USD",
      priceNote: null,
      priceAmount: null,
      videoCount: null,
      isAddonVariant: false,
      badge: null,
      subtitle: null,
      sortOrder: 2,
      features: [
        "Buyer guides, relocation guides, market reports, or any PDF built for your market",
        "Includes writing, design, and delivery setup",
      ],
      highlightFeatures: null,
      stripeUrl: null,
    },
    {
      id: "addon-3",
      name: "Rush Funnel",
      price: "$950",
      priceNote: null,
      priceAmount: null,
      videoCount: null,
      isAddonVariant: false,
      badge: null,
      subtitle: "Available to Mastery members only",
      sortOrder: 3,
      features: ["Need a funnel faster than the 90-day cadence? We'll build it on a priority timeline"],
      highlightFeatures: null,
      stripeUrl: null,
    },
  ];

  for (const pkg of addonPackages) {
    const { id, ...rest } = pkg;
    await prisma.servicePackage.upsert({
      where: { id },
      update: { ...rest, features: rest.features, highlightFeatures: rest.highlightFeatures ?? undefined },
      create: { id, categoryId: addons.id, ...rest, features: rest.features, highlightFeatures: rest.highlightFeatures ?? undefined },
    });
  }

  // ── Cleanup: delete old categories now that packages are re-assigned ──
  for (const oldSlug of ["editing", "mastery", "ultimate"]) {
    const old = await prisma.serviceCategory.findUnique({ where: { slug: oldSlug } });
    if (old) {
      const pkgCount = await prisma.servicePackage.count({ where: { categoryId: old.id } });
      if (pkgCount === 0) {
        await prisma.serviceCategory.delete({ where: { id: old.id } });
        console.log(`  Deleted old category: ${oldSlug}`);
      } else {
        console.log(`  Skipped deleting ${oldSlug} — still has ${pkgCount} package(s)`);
      }
    }
  }

  console.log("✅ Service seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
