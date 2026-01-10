#!/bin/bash

# Codebase Analysis Script for Albania JobFlow
# Uses standard Unix tools to analyze the codebase

echo "🔍 Albania JobFlow - Codebase Analysis"
echo "════════════════════════════════════════════════════════"
echo ""

REPORT_FILE="CODEBASE_ANALYSIS_REPORT.md"

cat > "$REPORT_FILE" << 'EOF'
# Codebase Analysis Report - Albania JobFlow

**Generated:** $(date)
**Project:** Albania JobFlow (Advance.al)

---

## 📊 Project Statistics

EOF

echo "📊 Gathering project statistics..."

# Count files by type
echo "### File Count by Type" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| File Type | Count |" >> "$REPORT_FILE"
echo "|-----------|-------|" >> "$REPORT_FILE"

find . -type f -name "*.ts" -o -name "*.tsx" | wc -l | xargs echo "| TypeScript/TSX |" >> "$REPORT_FILE"
find . -type f -name "*.js" | wc -l | xargs echo "| JavaScript |" >> "$REPORT_FILE"
find . -type f -name "*.json" | wc -l | xargs echo "| JSON |" >> "$REPORT_FILE"
find . -type f -name "*.md" | wc -l | xargs echo "| Markdown |" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"

# Lines of code
echo "### Lines of Code" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

BACKEND_LINES=$(find backend/src -name "*.js" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
FRONTEND_LINES=$(find frontend/src -name "*.tsx" -o -name "*.ts" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

echo "- **Backend (JavaScript):** $BACKEND_LINES lines" >> "$REPORT_FILE"
echo "- **Frontend (TypeScript/React):** $FRONTEND_LINES lines" >> "$REPORT_FILE"
echo "- **Total:** $((BACKEND_LINES + FRONTEND_LINES)) lines" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Component count
echo "### Component Structure" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

ROUTES=$(find backend/src/routes -name "*.js" 2>/dev/null | wc -l)
MODELS=$(find backend/src/models -name "*.js" 2>/dev/null | wc -l)
MIDDLEWARE=$(find backend/src/middleware -name "*.js" 2>/dev/null | wc -l)
COMPONENTS=$(find frontend/src/components -name "*.tsx" 2>/dev/null | wc -l)
PAGES=$(find frontend/src/pages -name "*.tsx" 2>/dev/null | wc -l)

echo "**Backend:**" >> "$REPORT_FILE"
echo "- Routes: $ROUTES" >> "$REPORT_FILE"
echo "- Models: $MODELS" >> "$REPORT_FILE"
echo "- Middleware: $MIDDLEWARE" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Frontend:**" >> "$REPORT_FILE"
echo "- Components: $COMPONENTS" >> "$REPORT_FILE"
echo "- Pages: $PAGES" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Find TODOs
echo "### TODO Comments" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX\|HACK" --include="*.js" --include="*.ts" --include="*.tsx" backend/src frontend/src 2>/dev/null | wc -l)
echo "Found **$TODO_COUNT** TODO/FIXME comments:" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rn "TODO\|FIXME\|XXX\|HACK" --include="*.js" --include="*.ts" --include="*.tsx" backend/src frontend/src 2>/dev/null | head -20 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Security patterns
echo "### Security Scan" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "**Password Handling:**" >> "$REPORT_FILE"
BCRYPT_COUNT=$(grep -r "bcrypt" --include="*.js" backend/src 2>/dev/null | wc -l)
echo "- bcrypt usage: $BCRYPT_COUNT occurrences" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "**Authentication:**" >> "$REPORT_FILE"
JWT_COUNT=$(grep -r "jwt" --include="*.js" backend/src 2>/dev/null | wc -l)
echo "- JWT usage: $JWT_COUNT occurrences" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Dependencies
echo "### Dependencies" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "**Backend Dependencies:**" >> "$REPORT_FILE"
echo "\`\`\`json" >> "$REPORT_FILE"
cat backend/package.json | jq '.dependencies' >> "$REPORT_FILE" 2>/dev/null || echo "Error reading dependencies" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "✅ Analysis complete! Report saved to: $REPORT_FILE"
echo ""
cat "$REPORT_FILE"
