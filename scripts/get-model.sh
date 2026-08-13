#!/bin/bash
# Downloads the small English Vosk model used for local wake word detection.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
if [ -f models/model.tar.gz ]; then
  echo "wake word model already present"
  exit 0
fi
curl -fL -o models/model.tar.gz \
  https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz
echo "wake word model downloaded to models/model.tar.gz"
