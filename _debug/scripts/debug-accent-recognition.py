#!/usr/bin/env python3
"""
Accent recognition debug script using dima806/english_accents_classification
(Wav2Vec2 fine-tuned on Common Voice, covers: us, england, indian, australia, canada).

Prerequisites (installed in Docker image):
    torch, transformers, pydub, numpy

If your audio is an MP3, ffmpeg must be available on PATH.

Usage:
    python _debug/scripts/debug-accent-recognition.py [audio_file]

    audio_file  Path to audio file (mp3/wav/etc). Defaults to the latest file
                in ./_debug/downloads/.
"""

import sys
import os
import warnings
warnings.simplefilter("ignore")
import glob
import tempfile
import json

# ---------------------------------------------------------------------------
# Resolve input file
# ---------------------------------------------------------------------------
if len(sys.argv) > 1:
    audio_path = sys.argv[1]
else:
    candidates = [
        f for f in glob.glob(os.path.join("_debug", "downloads", "*"))
        if not f.endswith("_denoised.wav")
    ]
    if not candidates:
        print("No audio file found in _debug/downloads/. Pass a path as argument.")
        sys.exit(1)
    audio_path = max(candidates, key=os.path.getmtime)
    print(f"Auto-selected: {audio_path}")

if not os.path.exists(audio_path):
    print(f"File not found: {audio_path}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Convert to 16 kHz mono WAV if necessary
# (Wav2Vec2 feature extractor expects 16 kHz float32 numpy array)
# ---------------------------------------------------------------------------
import numpy as np

wav_np = None
tmp_wav = None

try:
    from pydub import AudioSegment
    print(f"Loading audio: {os.path.basename(audio_path)}")
    seg = AudioSegment.from_file(audio_path)
    seg = seg.set_frame_rate(16000).set_channels(1)
    # Export to a temp WAV so we can read back as numpy without torchaudio
    tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_wav.close()
    seg.export(tmp_wav.name, format="wav")

    import wave, struct
    with wave.open(tmp_wav.name, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    if sampwidth == 2:
        samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        samples = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        samples = (np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0

    # Truncate to max 60 seconds to prevent OOM errors on long videos
    max_samples = 60 * 16000
    if len(samples) > max_samples:
        print(f"Truncating audio from {len(samples)/16000:.1f}s to 60s to prevent memory issues...")
        samples = samples[:max_samples]

    wav_np = samples  # 1-D float32 numpy array at 16 kHz

except ImportError:
    print("pydub not installed. Install with: pip install pydub\nAlso ensure ffmpeg is on PATH.")
    sys.exit(1)
except Exception as e:
    print(f"Audio loading failed: {e}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Load model — ylacombe/accent-classifier
# Wav2Vec2 model trained on 28 accents, including Irish
# Accents include: American, Australian, Canadian, English, Irish, Scottish, Welsh, etc.
# ---------------------------------------------------------------------------
model_id = "ylacombe/accent-classifier"
cache_dir = os.path.join("_debug", "models", "accent-classifier")

print(f"\nLoading model : {model_id}")
print(f"  Cache dir   : {cache_dir}")
print(f"  Note        : First run will download from HuggingFace\n")

import torch

try:
    from transformers import pipeline
except ImportError:
    print("transformers not found. Install with: pip install transformers")
    sys.exit(1)

# Set up transformers cache to use our mounted volume
os.environ["HF_HOME"] = cache_dir

device = 0 if torch.cuda.is_available() else -1
classifier = pipeline(
    "audio-classification",
    model=model_id,
    device=device
)

# ---------------------------------------------------------------------------
# Run inference
# ---------------------------------------------------------------------------
print(f"Running inference on: {os.path.basename(audio_path)}")

# pipeline can accept the numpy array if we provide the sampling rate
# wav_np is 1-D float32 numpy array at 16 kHz
predictions = classifier({"array": wav_np, "sampling_rate": 16000}, top_k=None)

# Create a list of all predictions
all_predictions = []
for p in predictions:
    all_predictions.append({
        "accent": p["label"].lower(),
        "score": round(p["score"], 4)
    })

# Sort descending by score
all_predictions = sorted(all_predictions, key=lambda x: x["score"], reverse=True)

# The confidence is just the max score
max_score = all_predictions[0]["score"]
predicted_label = all_predictions[0]["accent"]

results = {
    "file": os.path.basename(audio_path),
    "predicted_accent": predicted_label,
    "confidence_score": max_score,
    "top_predictions": all_predictions,
}

# ---------------------------------------------------------------------------
# Cleanup & output
# ---------------------------------------------------------------------------
if tmp_wav is not None:
    try:
        os.unlink(tmp_wav.name)
    except OSError:
        pass

print("\n" + "=" * 50)
print(json.dumps(results, indent=2))
print("=" * 50)
