#!/bin/bash

# Get the list of changed files between the last commit and current HEAD
CHANGED_FILES=$(git diff --name-only HEAD^ HEAD)

echo "Checking changed files..."

# If no files changed (unlikely in CI, but good for safety)
if [ -z "$CHANGED_FILES" ]; then
  echo "No changes detected. Skipping build."
  exit 0
fi

# Loop through each changed file
while read -r file; do
  # CONDITION A: File is NOT in the public directory
  if [[ ! $file =~ ^public/ ]]; then
    echo "✅ Change detected outside public directory: $file"
    exit 1 # Vercel: Exit 1 means "Proceed with build"
  fi

  # CONDITION B: File IS in public, but has the 'htr-' prefix
  if [[ $file =~ ^public/htr- ]]; then
    echo "✅ Change detected in public/ with htr- prefix: $file"
    exit 1 # Vercel: Exit 1 means "Proceed with build"
  fi
done <<< "$CHANGED_FILES"

# If we reached here, all changes were in 'public/' and none had the 'htr-' prefix
echo "🛑 Only non-HTR public assets changed. Ignoring build."
exit 0 # Vercel: Exit 0 means "Cancel build"
