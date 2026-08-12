#!/usr/bin/env bash
# Fails if any TODO_ placeholder is still in the published site.
#
# The Google for Startups Cloud Program review requires the founder's and the
# company's LinkedIn URLs and the founding date to be visible on the public
# site. Those three facts are not in this repo, so they are committed as
# TODO_ tokens. Run this before merging to main.
#
#   bash scripts/check-placeholders.sh
set -uo pipefail
cd "$(dirname "$0")/.."

FILES=$(git ls-files '*.html' '*.js' '*.css' '*.json' '*.xml' | grep -v '^scripts/')

HITS=$(grep -n -o 'TODO_[A-Z_]*' -- $FILES 2>/dev/null | sort -u)

if [ -z "$HITS" ]; then
  echo "OK — no TODO_ placeholders left."
  exit 0
fi

echo "Placeholders still present — fill these in before publishing:"
echo
echo "$HITS" | sed 's/^/  /'
echo
cat <<'EOF'
  TODO_FOUNDER_LINKEDIN_URL   the founder's LinkedIn profile URL
  TODO_COMPANY_LINKEDIN_URL   the MAIKNOWLEDGE LLP company page URL
  TODO_FOUNDING_DATE          founding date as displayed, e.g. "12 March 2026"
  TODO_FOUNDING_DATE_ISO      the same date as YYYY-MM-DD (JSON-LD needs ISO)
EOF
exit 1
