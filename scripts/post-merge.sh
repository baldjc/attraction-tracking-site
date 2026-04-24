#!/bin/bash
set -e

npm install --no-audit --no-fund
npx prisma generate
npx prisma db push --accept-data-loss
