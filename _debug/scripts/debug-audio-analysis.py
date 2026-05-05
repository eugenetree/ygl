#!/usr/bin/env python3
import sys
import os
import warnings
warnings.simplefilter("ignore")
import glob
import tempfile
import json
import torch
import numpy as np
import math

try:
    from pydub import AudioSegment
    from speechbrain.inference.speaker import EncoderClassifier
    from sklearn.cluster import AgglomerativeClustering
except ImportError as e:
    print(f"Missing dependencies: {e}")
    sys.exit(1)

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
        print("No audio file found in _debug/downloads/.")
        sys.exit(1)
    audio_path = max(candidates, key=os.path.getmtime)

if not os.path.exists(audio_path):
    print(f"File not found: {audio_path}")
    sys.exit(1)

print(f"Loading audio for analysis: {os.path.basename(audio_path)}")

try:
    seg = AudioSegment.from_file(audio_path)
    seg = seg.set_frame_rate(16000).set_channels(1)
except Exception as e:
    print(f"Failed to load audio: {e}")
    sys.exit(1)

# For performance, only analyze the first 3 minutes
max_duration_ms = 3 * 60 * 1000
if len(seg) > max_duration_ms:
    print(f"Truncating audio to 3 minutes for faster analysis...")
    seg = seg[:max_duration_ms]

samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
if seg.sample_width == 2:
    samples /= 32768.0
elif seg.sample_width == 4:
    samples /= 2147483648.0
else:
    samples = (samples - 128.0) / 128.0

wav_np = samples
wav_tensor = torch.from_numpy(wav_np)

# ---------------------------------------------------------------------------
# 1. Noise Analysis & VAD (Voice Activity Detection) using Silero VAD
# ---------------------------------------------------------------------------
print("Running Voice Activity Detection and Noise Analysis...")
model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                              model='silero_vad',
                              force_reload=False,
                              onnx=False)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils

speech_timestamps = get_speech_timestamps(wav_tensor, model, sampling_rate=16000)

speech_samples = sum((ts['end'] - ts['start'] for ts in speech_timestamps))
total_samples = len(wav_np)
speech_percentage = (speech_samples / total_samples) * 100 if total_samples > 0 else 0

# Better SNR Calculation:
# Instead of averaging all "non-speech" (which might include loud music intros),
# we estimate the true noise floor using the 5th percentile of short frame energies.
# We estimate the active speech level using the 95th percentile.
frame_len = int(16000 * 0.03) # 30ms frames
num_frames = len(wav_np) // frame_len
if num_frames > 0:
    # Reshape into frames and calculate RMS energy per frame (removing DC offset)
    frames = wav_np[:num_frames * frame_len].reshape(num_frames, frame_len)
    frames = frames - np.mean(frames, axis=1, keepdims=True)
    frame_rms = np.sqrt(np.mean(frames**2, axis=1))
    
    noise_floor_rms = np.percentile(frame_rms, 5) + 1e-10
    signal_rms = np.percentile(frame_rms, 95) + 1e-10
    
    snr_db = 20 * math.log10(signal_rms / noise_floor_rms)
else:
    snr_db = 0.0

# ---------------------------------------------------------------------------
# 2. Speaker Counting (Diarization approximation)
# ---------------------------------------------------------------------------
print("Running Speaker Embedding Extraction...")
spk_model_id = "speechbrain/spkrec-ecapa-voxceleb"
cache_dir = os.path.join("_debug", "models", "spkrec-ecapa-voxceleb")
spk_classifier = EncoderClassifier.from_hparams(source=spk_model_id, savedir=cache_dir)

embeddings = []
valid_timestamps = []

# Extract embeddings for each speech segment
for ts in speech_timestamps:
    start, end = ts['start'], ts['end']
    chunk = wav_tensor[start:end]
    
    # Skip very short segments (e.g. less than 1.0 seconds) for more reliable speaker embeddings
    if len(chunk) < 16000 * 1.0:
        continue
    
    signal = chunk.unsqueeze(0)
    with torch.no_grad():
        emb = spk_classifier.encode_batch(signal)
    embeddings.append(emb.squeeze().numpy())
    valid_timestamps.append(ts)

num_speakers = 0
if len(embeddings) > 0:
    print("Clustering speakers...")
    X = np.stack(embeddings)
    
    # Simple Agglomerative Clustering
    clusterer = AgglomerativeClustering(
        n_clusters=None, 
        distance_threshold=0.6, # This threshold determines how strictly to separate speakers. 0.6 is a reasonable default for cosine distance on ECAPA embeddings.
        metric="cosine", 
        linkage="average"
    )
    labels = clusterer.fit_predict(X)
    num_speakers = len(set(labels))
else:
    print("No sufficient speech segments found for speaker counting.")

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
results = {
    "file": os.path.basename(audio_path),
    "noise_analysis": {
        "snr_db": round(snr_db, 2),
        "speech_percentage": f"{round(speech_percentage, 2)}%",
        "quality": "Good" if snr_db > 15 else "Fair" if snr_db > 5 else "Poor"
    },
    "speaker_analysis": {
        "estimated_speaker_count": num_speakers,
        "valid_speech_segments_analyzed": len(embeddings)
    }
}

print("\n" + "=" * 50)
print(json.dumps(results, indent=2))
print("=" * 50)
