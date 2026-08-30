#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Starting NagarAI (ml-service :8000, server :5000, client :3001)..."
echo "First time? Run: npm run install:all"
npm run dev
