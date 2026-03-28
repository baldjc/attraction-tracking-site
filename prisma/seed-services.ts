import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding service categories and packages...");

  // ── Category 1: Attraction Editing ──────────────────────────
  const editing = await prisma.serviceCategory.upsert({
    where: { slug: "editing" },
    update: {
      name: "Attraction Editing",
      description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.",
      icon: "FilmIcon",
      accentColour: "blue",
      sortOrder: 1,
      published: true,
    },
    create: {
      name: "Attraction Editing",
      slug: "editing",
      description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.",
      icon: "FilmIcon",
      accentColour: "blue",
      sortOrder: 1,
      published: true,
    },
  });

  const editingPackages = [
    {
      name: "2 Video Package",
      price: "$500/mo",
      priceNote: "USD",
      badge: null,
      subtitle: null,
      sortOrder: 1,
      features: ["Professional editing by ABV team", "Music and asset licensing", "Graphics, titles, and b-roll", "Upload to Frame.io for review", "2-3 revisions per video", "Onboarding call to customise to your brand"],
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k",
    },
    {
      name: "2 Video + Jared",
      price: "$800/mo",
      priceNote: "USD",
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 2,
      features: ["Professional editing by ABV team", "Music and asset licensing", "Graphics, titles, and b-roll", "Upload to Frame.io for review", "2-3 revisions per video", "Onboarding call to customise to your brand"],
      highlightFeatures: ["Comprehensive review of shooting, setup, and delivery", "Editing suggestions delivered in Frame.io", "Ideas for future content improvements", "15-minute coaching call"],
      stripeUrl: "https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l",
    },
    {
      name: "4 Video Package",
      price: "$1,000/mo",
      priceNote: "USD",
      badge: null,
      subtitle: null,
      sortOrder: 3,
      features: ["Professional editing by ABV team", "Music and asset licensing", "Graphics, titles, and b-roll", "Upload to Frame.io for review", "2-3 revisions per video", "Onboarding call to customise to your brand"],
      highlightFeatures: null,
      stripeUrl: "https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m",
    },
    {
      name: "4 Video + Jared",
      price: "$1,500/mo",
      priceNote: "USD",
      badge: "+ Jared's Feedback",
      subtitle: null,
      sortOrder: 4,
      features: ["Professional editing by ABV team", "Music and asset licensing", "Graphics, titles, and b-roll", "Upload to Frame.io for review", "2-3 revisions per video", "Onboarding call to customise to your brand"],
      highlightFeatures: ["Comprehensive review of shooting, setup, and delivery", "Editing suggestions delivered in Frame.io", "Ideas for future content improvements", "15-minute coaching call"],
      stripeUrl: "https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n",
    },
  ];

  for (const pkg of editingPackages) {
    await prisma.servicePackage.upsert({
      where: { id: `editing-${pkg.sortOrder}` },
      update: { ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
      create: { id: `editing-${pkg.sortOrder}`, categoryId: editing.id, ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
    });
  }

  // ── Category 2: Attraction Mastery ──────────────────────────
  const mastery = await prisma.serviceCategory.upsert({
    where: { slug: "mastery" },
    update: {
      name: "Attraction Mastery",
      description: "The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment.",
      icon: "RocketLaunchIcon",
      accentColour: "slate",
      sortOrder: 2,
      published: true,
    },
    create: {
      name: "Attraction Mastery",
      slug: "mastery",
      description: "The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment.",
      icon: "RocketLaunchIcon",
      accentColour: "slate",
      sortOrder: 2,
      published: true,
    },
  });

  const masteryPackages = [
    {
      name: "Mastery 2",
      price: "$2,495/mo",
      priceNote: "USD",
      badge: null,
      subtitle: "2 long-form video edits/mo",
      sortOrder: 1,
      features: ["Foundational Membership Benefits included", "1 new funnel every 90 days", "Custom thumbnails per video", "GoHighLevel account (lead capture, follow-up, pipeline)", "Title & thumbnail review via Slack (1-1 with Jared)", "Priority Slack responses", "Every video scored & reviewed", "Strategy call with Jared (30 min) — 1/month"],
      highlightFeatures: ["2 long-form video edits per month", "1 full funnel built at launch"],
      stripeUrl: "https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q",
    },
    {
      name: "Mastery 4",
      price: "$3,495/mo",
      priceNote: "USD",
      badge: "Most Comprehensive",
      subtitle: "4 long-form video edits/mo",
      sortOrder: 2,
      features: ["Foundational Membership Benefits included", "1 new funnel every 90 days", "Custom thumbnails per video", "GoHighLevel account (lead capture, follow-up, pipeline)", "Title & thumbnail review via Slack (1-1 with Jared)", "Priority Slack responses", "Every video scored & reviewed", "Strategy call with Jared (30 min) — 1/month"],
      highlightFeatures: ["4 long-form video edits per month", "2 full funnels built at launch"],
      stripeUrl: "https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r",
    },
  ];

  for (const pkg of masteryPackages) {
    await prisma.servicePackage.upsert({
      where: { id: `mastery-${pkg.sortOrder}` },
      update: { ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
      create: { id: `mastery-${pkg.sortOrder}`, categoryId: mastery.id, ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
    });
  }

  // ── Category 3: Ultimate Mastery ────────────────────────────
  const ultimate = await prisma.serviceCategory.upsert({
    where: { slug: "ultimate" },
    update: {
      name: "Ultimate Mastery",
      description: "You show up, film, and close deals. We do literally everything else.",
      icon: "SparklesIcon",
      accentColour: "purple",
      sortOrder: 3,
      published: true,
    },
    create: {
      name: "Ultimate Mastery",
      slug: "ultimate",
      description: "You show up, film, and close deals. We do literally everything else.",
      icon: "SparklesIcon",
      accentColour: "purple",
      sortOrder: 3,
      published: true,
    },
  });

  await prisma.servicePackage.upsert({
    where: { id: "ultimate-1" },
    update: {
      name: "Ultimate Mastery",
      price: "$4,999/mo",
      priceNote: "USD",
      badge: "Full Service",
      subtitle: null,
      sortOrder: 1,
      features: ["Everything in Mastery 4 included", "2 lead magnet funnels built per month", "Local market research — what's ranking and trending in your city", "SEO-optimised descriptions and tags for every video", "A/B thumbnail variants per video", "Ongoing content calendar management and updates", "Strategy session with Jared (60 min) — every 2 weeks", "Quarterly 16-principle channel audit with written report", "Priority everything — fastest turnaround, same-day responses", "Community post and pinned comment strategy written and scheduled"],
      highlightFeatures: ["4 long-form video edits per month", "2 full funnels built at launch", "Ready-to-film scripts researched and written for you"],
      stripeUrl: null,
    },
    create: {
      id: "ultimate-1",
      categoryId: ultimate.id,
      name: "Ultimate Mastery",
      price: "$4,999/mo",
      priceNote: "USD",
      badge: "Full Service",
      subtitle: null,
      sortOrder: 1,
      features: ["Everything in Mastery 4 included", "2 lead magnet funnels built per month", "Local market research — what's ranking and trending in your city", "SEO-optimised descriptions and tags for every video", "A/B thumbnail variants per video", "Ongoing content calendar management and updates", "Strategy session with Jared (60 min) — every 2 weeks", "Quarterly 16-principle channel audit with written report", "Priority everything — fastest turnaround, same-day responses", "Community post and pinned comment strategy written and scheduled"],
      highlightFeatures: ["4 long-form video edits per month", "2 full funnels built at launch", "Ready-to-film scripts researched and written for you"],
      stripeUrl: null,
    },
  });

  // ── Category 4: Add-Ons ─────────────────────────────────────
  const addons = await prisma.serviceCategory.upsert({
    where: { slug: "add-ons" },
    update: {
      name: "Add-Ons",
      description: "Available extras to complement your package.",
      icon: "PuzzlePieceIcon",
      accentColour: "gray",
      sortOrder: 4,
      published: true,
    },
    create: {
      name: "Add-Ons",
      slug: "add-ons",
      description: "Available extras to complement your package.",
      icon: "PuzzlePieceIcon",
      accentColour: "gray",
      sortOrder: 4,
      published: true,
    },
  });

  const addonPackages = [
    {
      name: "Custom Thumbnails",
      price: "$100 – $150",
      priceNote: null,
      badge: null,
      subtitle: "$100 with Editing/Mastery, $150 standalone",
      sortOrder: 1,
      features: ["Professional, click-worthy thumbnails designed for your brand and audience"],
      highlightFeatures: null,
      stripeUrl: null,
    },
    {
      name: "Lead Magnet Creation",
      price: "~$1,000 USD",
      priceNote: null,
      badge: null,
      subtitle: null,
      sortOrder: 2,
      features: ["Buyer guides, relocation guides, market reports, or any PDF built for your market", "Includes writing, design, and delivery setup"],
      highlightFeatures: null,
      stripeUrl: null,
    },
    {
      name: "Rush Funnel",
      price: "$950",
      priceNote: null,
      badge: null,
      subtitle: "Available to Mastery members only",
      sortOrder: 3,
      features: ["Need a funnel faster than the 90-day cadence? We'll build it on a priority timeline"],
      highlightFeatures: null,
      stripeUrl: null,
    },
  ];

  for (const pkg of addonPackages) {
    await prisma.servicePackage.upsert({
      where: { id: `addon-${pkg.sortOrder}` },
      update: { ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
      create: { id: `addon-${pkg.sortOrder}`, categoryId: addons.id, ...pkg, features: pkg.features, highlightFeatures: pkg.highlightFeatures ?? undefined },
    });
  }

  console.log("✅ Service seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
