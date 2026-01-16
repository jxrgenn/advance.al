#!/bin/bash

# Script to fix tutorial scroll locking in multiple files

FILES=(
  "frontend/src/pages/EmployersPage.tsx"
  "frontend/src/pages/PostJob.tsx"
  "frontend/src/pages/EmployerDashboard.tsx"
)

for file in "${FILES[@]}"; do
  echo "Processing $file..."

  # 1. Add useRef to imports (if useState is present)
  sed -i '' 's/import { useState, useEffect/import { useState, useEffect, useRef/g' "$file"

  # 2. Replace isScrollLocked state with ref (this is more complex, will do manually)
  echo "  - Added useRef to imports"

done

echo "Done! Now manually replace state with ref in each file."
