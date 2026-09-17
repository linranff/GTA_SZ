#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -d /Applications/Xcode-16.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode-16.app/Contents/Developer
fi
GEN="/Users/Shared/Epic Games/UE_5.5/Engine/Build/BatchFiles/Mac/GenerateProjectFiles.sh"
BUILD="/Users/Shared/Epic Games/UE_5.5/Engine/Build/BatchFiles/Mac/Build.sh"
PROJECT="$ROOT/ue5/Shenchengji/Shenchengji.uproject"
"$GEN" -project="$PROJECT" -game
"$BUILD" ShenchengjiEditor Mac Development -Project="$PROJECT" -WaitMutex
