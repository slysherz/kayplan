#!/usr/bin/env bash
# No athlete's name may be in this folder or in its commit messages (DESIGN.md 6.5).
# The roster is in the coach's notes outside the repository; this reads the first names from it
# and searches for them here. Run it before every commit:  bash tools/check-names.sh
set -u
cd "$(dirname "$0")/.."
roster="${1:-../provas.md}"
if [ ! -f "$roster" ]; then echo "roster not found at $roster; give its path as the first argument" >&2; exit 2; fi
# the first column of the roster table: rows whose second column is a birth year or "?"
names=$(awk -F'|' 'NF > 4 && $3 ~ /^ *([0-9]{4}|\?) *$/ { gsub(/^ +| +$/, "", $2); if ($2 != "") print $2 }' "$roster" | sort -u)
if [ -z "$names" ]; then echo "no names found in $roster" >&2; exit 2; fi
pattern=$(printf '%s\n' "$names" | paste -sd'|')
found=0
if grep -rniwE --exclude-dir=.git --exclude-dir=node_modules -- "$pattern" .; then found=1; fi
if [ -d .git ] && git log --format='%H %B' 2>/dev/null | grep -niwE -- "$pattern"; then found=1; fi
if [ "$found" = 1 ]; then echo "names found: remove them before committing" >&2; exit 1; fi
echo "no names found ($(printf '%s\n' "$names" | wc -l) checked)"
