from __future__ import annotations

import numpy as np


def detect_blink_like_artifact(
    window: np.ndarray,
    channel_names: tuple[str, ...],
    threshold_volts: float = 60e-6,
) -> bool:
    frontal_indices = [index for index, name in enumerate(channel_names) if name.startswith("Fp")]
    if not frontal_indices:
        return False

    frontal_peak = float(np.max(np.abs(window[frontal_indices])))
    return frontal_peak >= threshold_volts


def artifact_intensity(window: np.ndarray, channel_names: tuple[str, ...], threshold_volts: float = 60e-6) -> float:
    frontal_indices = [index for index, name in enumerate(channel_names) if name.startswith("Fp")]
    if not frontal_indices:
        return 0.0

    frontal_peak = float(np.max(np.abs(window[frontal_indices])))
    return min(1.0, frontal_peak / threshold_volts)


def channel_quality(window: np.ndarray, channel_names: tuple[str, ...]) -> dict[str, str]:
    quality: dict[str, str] = {}
    for index, channel in enumerate(channel_names):
        peak_to_peak = float(np.ptp(window[index]))
        if peak_to_peak > 150e-6:
            quality[channel] = "noisy"
        elif peak_to_peak < 1e-6:
            quality[channel] = "flat"
        else:
            quality[channel] = "ok"
    return quality
