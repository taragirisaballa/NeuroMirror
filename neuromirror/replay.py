from __future__ import annotations

import json
import sys
import time
from collections.abc import Iterator

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.processing.artifacts import channel_quality, detect_blink_like_artifact
from neuromirror.processing.bandpower import bandpower_by_channel, posterior_alpha_ratio


def replay_frames(
    data: np.ndarray,
    times: np.ndarray,
    labels: list[str],
    config: ReplayConfig,
) -> Iterator[dict[str, object]]:
    for end in range(config.window_samples, data.shape[1] + 1, config.step_samples):
        start = end - config.window_samples
        window = data[:, start:end]
        features = bandpower_by_channel(window, config.sample_rate_hz, config.channels)
        yield {
            "time_s": round(float(times[end - 1]), 3),
            "state": labels[end - 1],
            "features": features,
            "raw_preview": _raw_preview(window, config.channels),
            "summary": {
                "posterior_alpha_ratio": posterior_alpha_ratio(features),
                "blink_like_artifact": detect_blink_like_artifact(window, config.channels),
                "channel_quality": channel_quality(window, config.channels),
            },
        }


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
