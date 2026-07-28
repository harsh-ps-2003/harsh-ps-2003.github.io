#!/bin/bash
# Export all .excalidraw files to SVG
# Usage: ./scripts/export-diagrams.sh [file.excalidraw]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [ -n "$1" ]; then
    # Export single file
    if [ -f "$1" ]; then
        output="${1%.excalidraw}.svg"
        echo "Exporting $1 -> $output"
        pnpm exec excalidraw-export "$1" --svg -o "$output"
    else
        echo "File not found: $1"
        exit 1
    fi
else
    # Export all .excalidraw files
    echo "Exporting all .excalidraw files..."
    
    # Find in content folder (for blog post diagrams)
    find content -name "*.excalidraw" -type f 2>/dev/null | while read -r file; do
        output="${file%.excalidraw}.svg"
        echo "  $file -> $output"
        pnpm exec excalidraw-export "$file" --svg -o "$output"
    done
    
    # Find in static/diagrams folder (for shared diagrams)
    find static/diagrams -name "*.excalidraw" -type f 2>/dev/null | while read -r file; do
        output="${file%.excalidraw}.svg"
        echo "  $file -> $output"
        pnpm exec excalidraw-export "$file" --svg -o "$output"
    done
    
    echo "Done!"
fi
