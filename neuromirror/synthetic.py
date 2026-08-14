from __future__ import annotations

import numpy as np

from neuromirror.config import ReplayConfig


def generate_eyes_open_closed(
    config: ReplayConfig,
    seconds: float,
    seed: int = 7,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Create a small EEG-like signal with stronger posterior alpha after halfway."""
    rng = np.random.default_rng(seed)
    sample_count = int(seconds * config.sample_rate_hz)
    times = np.arange(sample_count) / config.sample_rate_hz
    data = np.zeros((len(config.channels), sample_count), dtype=float)
    halfway = sample_count // 2

    for channel_index, channel in enumerate(config.channels):
        noise = rng.normal(0, 7e-6, sample_count)
        theta = 5e-6 * np.sin(2 * np.pi * 6 * times + channel_index * 0.4)
        beta = 2e-6 * np.sin(2 * np.pi * 18 * times + channel_index * 0.2)
        alpha_gain = 2e-6
        if channel.startswith("O"):
            alpha_gain = 6e-6
        alpha = alpha_gain * np.sin(2 * np.pi * 10 * times + channel_index * 0.3)
        alpha[halfway:] *= 3.0
        data[channel_index] = noise + theta + beta + alpha

    blink_center = int(config.sample_rate_hz * min(seconds * 0.25, 3.0))
    blink_width = max(1, int(config.sample_rate_hz * 0.08))
    blink = 75e-6 * np.exp(-0.5 * ((np.arange(sample_count) - blink_center) / blink_width) ** 2)
    for channel_index, channel in enumerate(config.channels):
        if channel.startswith("Fp"):
            data[channel_index] += blink

    labels = ["eyes_open" if index < halfway else "eyes_closed" for index in range(sample_count)]
    return data, times, labels
