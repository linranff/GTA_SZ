#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -d /Applications/Xcode-16.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode-16.app/Contents/Developer
fi
EDITOR="/Users/Shared/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
exec "$EDITOR" "$ROOT/ue5/Shenchengji/Shenchengji.uproject" /Game/Maps/CombatLab -game -game="/Script/Shenchengji.ShenchengjiCombatLabGameMode"
