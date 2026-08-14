from __future__ import annotations

import numpy as np


def dominant_rhythm(features: dict[str, dict[str, float]]) -> str:
    totals = _band_totals(features)
    if not totals:
        return "unknown"
    return max(totals, key=totals.get)


def signal_amplitude_uv(window: np.ndarray) -> float:
    return float(np.median(np.ptp(window, axis=1)) * 1e6)


def hemispheric_balance(features: dict[str, dict[str, float]], band: str = "alpha") -> float:
    left = [bands[band] for channel, bands in features.items() if _side(channel) == "left" and band in bands]
    right = [bands[band] for channel, bands in features.items() if _side(channel) == "right" and band in bands]
    if not left or not right:
        return 0.0
    left_mean = float(np.mean(left))
    right_mean = float(np.mean(right))
    return (left_mean - right_mean) / (left_mean + right_mean + 1e-18)


def posterior_alpha_asymmetry(features: dict[str, dict[str, float]]) -> float:
    left = features.get("O1", {}).get("alpha")
    right = features.get("O2", {}).get("alpha")
    if left is None or right is None:
        return 0.0
    return (left - right) / (left + right + 1e-18)


def spectral_spread(features: dict[str, dict[str, float]]) -> float:
    totals = _band_totals(features)
    values = np.array(list(totals.values()), dtype=float)
    total = float(np.sum(values))
    if total <= 0:
        return 0.0
    probabilities = values / total
    entropy = -float(np.sum(probabilities * np.log2(probabilities + 1e-18)))
    return entropy / np.log2(len(probabilities))


def _band_totals(features: dict[str, dict[str, float]]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for bands in features.values():
        for band, value in bands.items():
            totals[band] = totals.get(band, 0.0) + value
    return totals


def _side(channel: str) -> str:
    digits = "".join(character for character in channel if character.isdigit())
    if not digits:
        return "midline"
    return "left" if int(digits[-1]) % 2 else "right"
