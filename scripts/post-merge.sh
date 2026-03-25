#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install --legacy-peer-deps

echo "[post-merge] Generating Prisma client..."
npx prisma generate

echo "[post-merge] Pushing schema changes to database..."
npx prisma db push --accept-data-loss

echo "[post-merge] Done."
