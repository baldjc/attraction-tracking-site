-- CreateEnum
CREATE TYPE "TeamActorType" AS ENUM ('primary', 'team', 'admin');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "TeamInviteStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeAsTeamMemberOf" TEXT;

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "teamUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'active',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "TeamInviteStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_activity_logs" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "actorType" "TeamActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_members_primaryUserId_idx" ON "team_members"("primaryUserId");

-- CreateIndex
CREATE INDEX "team_members_teamUserId_idx" ON "team_members"("teamUserId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_primaryUserId_teamUserId_key" ON "team_members"("primaryUserId", "teamUserId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_tokenHash_key" ON "team_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invites_primaryUserId_idx" ON "team_invites"("primaryUserId");

-- CreateIndex
CREATE INDEX "team_invites_email_idx" ON "team_invites"("email");

-- CreateIndex
CREATE INDEX "team_activity_logs_primaryUserId_createdAt_idx" ON "team_activity_logs"("primaryUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamUserId_fkey" FOREIGN KEY ("teamUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_activity_logs" ADD CONSTRAINT "team_activity_logs_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

