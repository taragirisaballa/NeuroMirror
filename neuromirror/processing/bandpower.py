from __future__ import annotations

import numpy as np
from scipy.signal import welch

BANDS_HZ: dict[str, tuple[float, float]] = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0),
}


def bandpower_by_channel(
    window: np.ndarray,
    sample_rate_hz: int,
    channel_names: tuple[str, ...],
) -> dict[str, dict[str, float]]:
    frequencies, power = welch(window, fs=sample_rate_hz, axis=1, nperseg=min(window.shape[1], 512))
    features: dict[str, dict[str, float]] = {}

    for channel_index, channel in enumerate(channel_names):
        channel_features: dict[str, float] = {}
        for band_name, (low_hz, high_hz) in BANDS_HZ.items():
            mask = (frequencies >= low_hz) & (frequencies < high_hz)
            channel_features[band_name] = float(np.trapezoid(power[channel_index, mask], frequencies[mask]))
        features[channel] = channel_features

    return features


def posterior_alpha_ratio(features: dict[str, dict[str, float]]) -> float:
    posterior = [bands["alpha"] for channel, bands in features.items() if channel.startswith("O")]
    all_alpha = [bands["alpha"] for bands in features.values()]
    if not posterior or not all_alpha:
        return 0.0
    return float(np.mean(posterior) / (np.mean(all_alpha) + 1e-18))
