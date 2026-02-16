#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FONTS_DIR="${BACKEND_DIR}/fonts"
FORCE=0

usage() {
  cat <<'EOF'
Install curated free-for-commercial-use subtitle fonts into backend/fonts.

Usage:
  backend/bin/install_subtitle_font_pack.sh [--force] [--fonts-dir <path>]

Options:
  --force             Overwrite existing files.
  --fonts-dir <path>  Target directory for .ttf files (default: backend/fonts).
  -h, --help          Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --fonts-dir)
      if [[ $# -lt 2 ]]; then
        echo "Error: --fonts-dir requires a value" >&2
        exit 1
      fi
      FONTS_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required but not installed." >&2
  exit 1
fi

mkdir -p "$FONTS_DIR"

# filename|download_url
FONT_PACK=(
  "Anton-Regular.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf"
  "ArchivoBlack-Regular.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf"
  "BarlowCondensed-SemiBold.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf"
  "BebasNeue-Regular.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf"
  "Inter-Variable.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
  "Lato-Bold.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Bold.ttf"
  "NotoSans-Regular.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf"
  "OpenSans-Variable.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf"
  "Oswald-Variable.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf"
  "Poppins-SemiBold.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf"
  "Roboto-Variable.ttf|https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf"
)

downloaded=0
skipped=0

for entry in "${FONT_PACK[@]}"; do
  file_name="${entry%%|*}"
  url="${entry#*|}"
  destination="${FONTS_DIR}/${file_name}"

  if [[ -f "$destination" && "$FORCE" -ne 1 ]]; then
    echo "Skipping existing: ${file_name}"
    skipped=$((skipped + 1))
    continue
  fi

  temp_file="$(mktemp)"
  cleanup_temp() {
    rm -f "$temp_file"
  }
  trap cleanup_temp EXIT

  echo "Downloading: ${file_name}"
  curl -fL --retry 3 --retry-delay 1 --connect-timeout 15 -o "$temp_file" "$url"

  magic="$(od -An -t x1 -N4 "$temp_file" | tr -d ' \n')"
  case "$magic" in
    00010000|74746366|74727565)
      ;;
    *)
      echo "Error: Downloaded file is not a valid TrueType font (${file_name})" >&2
      exit 1
      ;;
  esac

  mv "$temp_file" "$destination"
  trap - EXIT
  downloaded=$((downloaded + 1))
done

echo
echo "Subtitle font pack installed."
echo "Downloaded: ${downloaded}"
echo "Skipped: ${skipped}"
echo "Target directory: ${FONTS_DIR}"
