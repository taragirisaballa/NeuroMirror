from __future__ import annotations

import json
import sys
import time
from collections.abc import Iterator

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.processing.artifacts import artifact_intensity, channel_quality, detect_blink_like_artifact
from neuromirror.processing.bandpower import bandpower_by_channel, posterior_alpha_ratio
from neuromirror.processing.features import (
    dominant_rhythm,
    hemispheric_balance,
    posterior_alpha_asymmetry,
    signal_amplitude_uv,
    spectral_spread,
)


def replay_frames(
    data: np.ndarray,
    times: np.ndarray,
    labels: list[str],
    config: ReplayConfig,
) -> Iterator[dict[str, object]]:
    frames: list[dict[str, object]] = []
    for frame_id, end in enumerate(range(config.window_samples, data.shape[1] + 1, config.step_samples)):
        start = end - config.window_samples
        window = data[:, start:end]
        features = bandpower_by_channel(window, config.sample_rate_hz, config.channels)
        summary = {
            "posterior_alpha_ratio": posterior_alpha_ratio(features),
            "blink_like_artifact": detect_blink_like_artifact(window, config.channels),
            "artifact_intensity": artifact_intensity(window, config.channels),
            "channel_quality": channel_quality(window, config.channels),
            "dominant_rhythm": dominant_rhythm(features),
            "signal_amplitude_uv": signal_amplitude_uv(window),
            "hemispheric_balance": hemispheric_balance(features),
            "posterior_alpha_asymmetry": posterior_alpha_asymmetry(features),
            "spectral_spread": spectral_spread(features),
        }
        summary["measurement_confidence"] = measurement_confidence(summary)
        frames.append(
            {
                "time_s": round(float(times[end - 1]), 3),
                "frame_id": frame_id,
                "state": labels[end - 1],
                "features": features,
                "raw_preview": _raw_preview(window, config.channels),
                "summary": summary,
            },
        )

    if not frames:
        return

    scaling = robust_band_scaling([frame["features"] for frame in frames])
    experiment = eyes_open_closed_analysis(frames)
    for frame in frames:
        normalized_features = normalize_features(frame["features"], scaling)
        frame["normalized_features"] = normalized_features
        frame["normalized_bands"] = average_normalized_bands(normalized_features)
        frame["experiment"] = experiment
        frame["scaling"] = {
            "band_power_unit": "V^2",
            "display_band_power_unit": "uV^2",
            "normalization": "log10 integrated band power, recording-level 5th-95th percentile scaling",
        }
        yield frame


def measurement_confidence(summary: dict[str, object]) -> float:
    artifact = float(summary.get("artifact_intensity", 0.0))
    qualities = dict(summary.get("channel_quality", {}))
    if not qualities:
        quality_confidence = 1.0
    else:
        scores = [1.0 if value == "ok" else 0.45 if value == "noisy" else 0.0 for value in qualities.values()]
        quality_confidence = float(np.mean(scores))
    return round(float(np.clip((1.0 - artifact * 0.78) * quality_confidence, 0.05, 1.0)), 3)


def robust_band_scaling(frames: list[dict[str, dict[str, float]]]) -> dict[str, dict[str, float]]:
    band_values: dict[str, list[float]] = {}
    for features in frames:
        for channel_bands in features.values():
            for band, value in channel_bands.items():
                band_values.setdefault(band, []).append(float(value))

    scaling: dict[str, dict[str, float]] = {}
    for band, values in band_values.items():
        log_values = np.log10(np.asarray(values, dtype=float) + 1e-24)
        low, high = np.percentile(log_values, [5, 95])
        if high <= low:
            high = low + 1.0
        scaling[band] = {"log_p05": float(low), "log_p95": float(high)}
    return scaling


def normalize_features(
    features: dict[str, dict[str, float]],
    scaling: dict[str, dict[str, float]],
) -> dict[str, dict[str, float]]:
    normalized: dict[str, dict[str, float]] = {}
    for channel, bands in features.items():
        normalized[channel] = {}
        for band, value in bands.items():
            band_scaling = scaling[band]
            log_value = float(np.log10(value + 1e-24))
            scaled = (log_value - band_scaling["log_p05"]) / (band_scaling["log_p95"] - band_scaling["log_p05"])
            normalized[channel][band] = round(float(np.clip(scaled, 0.0, 1.0)), 4)
    return normalized


def average_normalized_bands(normalized_features: dict[str, dict[str, float]]) -> dict[str, float]:
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for channel_bands in normalized_features.values():
        for band, value in channel_bands.items():
            totals[band] = totals.get(band, 0.0) + value
            counts[band] = counts.get(band, 0) + 1
    return {band: round(total / counts[band], 4) for band, total in totals.items()}


def eyes_open_closed_analysis(frames: list[dict[str, object]], min_confidence: float = 0.5) -> dict[str, object]:
    clean_frames = [
        frame
        for frame in frames
        if not bool(frame["summary"].get("blink_like_artifact"))
        and float(frame["summary"].get("measurement_confidence", 0.0)) >= min_confidence
    ]
    excluded = len(frames) - len(clean_frames)
    comparisons = {
        "O1_alpha": state_comparison(clean_frames, ("O1",), "alpha"),
        "O2_alpha": state_comparison(clean_frames, ("O2",), "alpha"),
        "posterior_alpha": state_comparison(clean_frames, ("O1", "O2"), "alpha"),
        "C3_alpha": state_comparison(clean_frames, ("C3",), "alpha"),
        "C4_alpha": state_comparison(clean_frames, ("C4",), "alpha"),
    }
    return {
        "name": "Eyes Open vs Eyes Closed",
        "clean_windows": len(clean_frames),
        "excluded_windows": excluded,
        "total_windows": len(frames),
        "min_confidence": min_confidence,
        "comparisons": comparisons,
    }


def state_comparison(frames: list[dict[str, object]], channels: tuple[str, ...], band: str) -> dict[str, float | int | None]:
    open_values = state_band_values(frames, "eyes_open", channels, band)
    closed_values = state_band_values(frames, "eyes_closed", channels, band)
    open_mean = mean_or_none(open_values)
    closed_mean = mean_or_none(closed_values)
    percent_change = None
    if open_mean is not None and closed_mean is not None and open_mean > 0:
        percent_change = ((closed_mean - open_mean) / open_mean) * 100.0
    return {
        "eyes_open_uv2": round(open_mean * 1e12, 3) if open_mean is not None else None,
        "eyes_closed_uv2": round(closed_mean * 1e12, 3) if closed_mean is not None else None,
        "percent_change": round(percent_change, 1) if percent_change is not None else None,
        "open_windows": len(open_values),
        "closed_windows": len(closed_values),
    }


def state_band_values(
    frames: list[dict[str, object]],
    state: str,
    channels: tuple[str, ...],
    band: str,
) -> list[float]:
    values: list[float] = []
    for frame in frames:
        if frame["state"] != state:
            continue
        channel_values = [frame["features"].get(channel, {}).get(band) for channel in channels]
        channel_values = [value for value in channel_values if value is not None]
        if channel_values:
            values.append(float(np.mean(channel_values)))
    return values


def mean_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.mean(values))


def print_replay(
    frames: Iterator[dict[str, object]],
    config: ReplayConfig,
    realtime: bool = False,
) -> None:
    delay = config.step_seconds / max(config.speed, 0.001)
    for frame in frames:
        try:
            print(json.dumps(frame), flush=True)
        except BrokenPipeError:
            sys.stdout = None
            return
        if realtime:
            time.sleep(delay)


def _raw_preview(window: np.ndarray, channel_names: tuple[str, ...], points: int = 80) -> dict[str, list[float]]:
    stride = max(1, window.shape[1] // points)
    preview: dict[str, list[float]] = {}
    for index, channel in enumerate(channel_names):
        samples = window[index, ::stride][-points:] * 1e6
        preview[channel] = [round(float(sample), 3) for sample in samples]
    return preview
