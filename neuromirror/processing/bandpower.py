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


def psd_by_channel(
    window: np.ndarray,
    sample_rate_hz: int,
    channel_names: tuple[str, ...],
    low_hz: float = 1.0,
    high_hz: float = 45.0,
) -> dict[str, dict[str, list[float] | float | None]]:
    frequencies, power = welch(window, fs=sample_rate_hz, axis=1, nperseg=min(window.shape[1], 512))
    mask = (frequencies >= low_hz) & (frequencies <= high_hz)
    selected_frequencies = frequencies[mask]
    spectra: dict[str, dict[str, list[float] | float | None]] = {}

    for channel_index, channel in enumerate(channel_names):
        selected_power = power[channel_index, mask]
        alpha_mask = (selected_frequencies >= BANDS_HZ["alpha"][0]) & (selected_frequencies < BANDS_HZ["alpha"][1])
        alpha_peak_hz = None
        if np.any(alpha_mask):
            alpha_frequencies = selected_frequencies[alpha_mask]
            alpha_power = selected_power[alpha_mask]
            alpha_peak_hz = float(alpha_frequencies[int(np.argmax(alpha_power))])
        spectra[channel] = {
            "frequencies_hz": [round(float(value), 2) for value in selected_frequencies],
            "power_uv2_per_hz": [round(float(value * 1e12), 4) for value in selected_power],
            "alpha_peak_hz": round(alpha_peak_hz, 2) if alpha_peak_hz is not None else None,
        }

    return spectra


def posterior_alpha_ratio(features: dict[str, dict[str, float]]) -> float:
    posterior = [bands["alpha"] for channel, bands in features.items() if channel.startswith("O")]
    all_alpha = [bands["alpha"] for bands in features.values()]
    if not posterior or not all_alpha:
        return 0.0
    return float(np.mean(posterior) / (np.mean(all_alpha) + 1e-18))
