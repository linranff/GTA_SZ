#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -d /Applications/Xcode-16.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode-16.app/Contents/Developer
fi
EDITOR="/Users/Shared/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
PROJECT="$ROOT/ue5/Shenchengji/Shenchengji.uproject"
if [[ ! -x "$EDITOR" ]]; then
  echo "未找到 UE 5.5 编辑器：$EDITOR"
  exit 1
fi
exec "$EDITOR" "$PROJECT" "$@"
