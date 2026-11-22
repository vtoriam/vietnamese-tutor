"""
Vietnamese tone feature extraction (Northern dialect).
Pipeline: load+resample -> normalise -> segment -> pYIN -> normalise contour
          -> STFT H1-H2 -> HNR (Praat) -> compact summary for the LLM.

pip install librosa praat-parselmouth numpy
Usage:
    python tone_features.py calib1.wav ... calib12.wav --target learner.wav
"""
import argparse
import json

import librosa
import numpy as np
import parselmouth

SR = 16000
HOP = 160            # 10 ms
WIN = 320            # 20 ms energy window
N_FFT = 512          # 32 ms STFT window
FMIN, FMAX = 50, 400
NOISE_MS = 500       # leading silence used for the noise floor
MIN_RUN = 3          # min consecutive speech frames
MAX_GAP = 6          # merge gaps <= 60 ms (6 hops)
ALPHA = 10.0         # threshold scale - tune on annotated calibration data
MIN_ENERGY = 1e-6    # absolute floor so near-digital-silence doesn't break T_d


# ---------- 1. Pre-processing ----------
def load(path):
    y, _ = librosa.load(path, sr=SR)          # resample + anti-alias filter
    return librosa.util.normalize(y)          # peak = 1 (silence is in same file)


# ---------- 2. Segmentation (short-time energy) ----------
def segment(y):
    frames = librosa.util.frame(y, frame_length=WIN, hop_length=HOP)
    energy = np.sum(frames ** 2, axis=0)

    n_noise = (int(NOISE_MS / 1000 * SR) - WIN) // HOP + 1
    e_noise = np.median(energy[:n_noise])
    thresh = max(ALPHA * e_noise, MIN_ENERGY)
    speech = energy > thresh

    # find runs of True: list of [start, end] frame indices (inclusive)
    runs, i = [], 0
    while i < len(speech):
        if speech[i]:
            j = i
            while j + 1 < len(speech) and speech[j + 1]:
                j += 1
            if j - i + 1 >= MIN_RUN:
                runs.append([i, j])
            i = j + 1
        else:
            i += 1
    if not runs:
        raise ValueError("No speech found - check ALPHA or recording.")

    # merge short gaps (glottalisation in nga / nang)
    merged = [runs[0]]
    for s, e in runs[1:]:
        if s - merged[-1][1] - 1 <= MAX_GAP:
            merged[-1][1] = e
        else:
            merged.append([s, e])

    s, e = max(merged, key=lambda r: r[1] - r[0])
    start, end = s * HOP, e * HOP + WIN
    return y[start:end], start / SR, end / SR


# ---------- 3. Pitch ----------
def pitch(seg):
    f0, voiced, vprob = librosa.pyin(
        seg, fmin=FMIN, fmax=FMAX, sr=SR,
        frame_length=1024,     # 64 ms: >= 3 periods at 50 Hz, fits short syllables
        hop_length=HOP)
    return f0, vprob           # NaN = unvoiced (kept on purpose)


def speaker_f0_avg(calib_paths):
    """Eq 12-13: mean of per-file mean F0 (NaNs ignored)."""
    means = [np.nanmean(pitch(segment(load(p))[0])[0]) for p in calib_paths]
    return float(np.mean(means))


# ---------- 4. Voice quality ----------
def h1_h2(seg, f0):
    S = np.abs(librosa.stft(seg, n_fft=N_FFT, hop_length=HOP))
    n = min(S.shape[1], len(f0))               # align frame counts
    S, f0 = S[:, :n], f0[:n]
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    H = librosa.f0_harmonics(S, f0=np.nan_to_num(f0), freqs=freqs, harmonics=[1, 2])
    H_db = librosa.amplitude_to_db(H, ref=1.0, top_db=None)
    diff = H_db[0] - H_db[1]
    diff[np.isnan(f0)] = np.nan                # unvoiced -> undefined
    return diff


def hnr(seg):
    snd = parselmouth.Sound(seg, sampling_frequency=SR)
    h = snd.to_harmonicity_cc(time_step=HOP / SR, minimum_pitch=75).values[0]
    h[h == -200] = np.nan                      # Praat's unvoiced marker
    return h


# ---------- 5. Feature extraction + LLM summary ----------
def resample_contour(x, n_points=10):
    """Sample a normalised-time contour at fixed points (interp over voiced frames)."""
    t = np.linspace(0, 1, len(x))
    ok = ~np.isnan(x)
    if ok.sum() < 2:
        return [None] * n_points
    grid = np.linspace(0, 1, n_points)
    return np.round(np.interp(grid, t[ok], x[ok]), 2).tolist()


def extract(path, f0_avg):
    seg, t0, t1 = segment(load(path))
    f0, vprob = pitch(seg)
    st = 12 * np.log2(f0 / f0_avg)             # Eq 11 (NaN stays NaN)
    t_norm = np.linspace(0, 1, len(st))        # Eq 10

    h12 = h1_h2(seg, f0)
    hn = hnr(seg)
    unvoiced = np.isnan(f0)
    voiced_st = st[~unvoiced]

    return {
        "duration_ms": round((t1 - t0) * 1000),
        "contour_semitones_10pt": resample_contour(st),
        "start_st": float(np.round(voiced_st[0], 2)) if voiced_st.size else None,
        "end_st": float(np.round(voiced_st[-1], 2)) if voiced_st.size else None,
        "min_st": float(np.round(np.nanmin(st), 2)) if voiced_st.size else None,
        "max_st": float(np.round(np.nanmax(st), 2)) if voiced_st.size else None,
        "min_position": float(np.round(t_norm[np.nanargmin(st)], 2)) if voiced_st.size else None,
        "unvoiced_fraction": float(np.round(unvoiced.mean(), 2)),
        "unvoiced_mid_syllable": bool(unvoiced[len(st) // 4: 3 * len(st) // 4].any()),
        "mean_h1_h2_db": float(np.round(np.nanmean(h12), 2)),
        "mean_hnr_db": float(np.round(np.nanmean(hn), 2)),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("calib", nargs="+", help="12 calibration WAVs")
    ap.add_argument("--target", required=True, help="learner WAV to analyse")
    a = ap.parse_args()

    f0_avg = speaker_f0_avg(a.calib)
    print(json.dumps({"f0_avg_hz": round(f0_avg, 1),
                      **extract(a.target, f0_avg)}, indent=2))
