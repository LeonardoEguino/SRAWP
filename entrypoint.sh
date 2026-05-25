#!/bin/sh
set -e

echo "Running migrations..."
npm run migration:run

echo "Running app..."
node dist/main