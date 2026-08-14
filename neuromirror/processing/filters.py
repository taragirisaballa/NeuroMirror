from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfiltfilt


def bandpass(
    data: np.ndarray,
    sample_rate_hz: int,
    low_hz: float = 1.0,
    high_hz: float = 45.0,
) -> np.ndarray:
    sos = butter(4, [low_hz, high_hz], btype="bandpass", fs=sample_rate_hz, output="sos")
    return sosfiltfilt(sos, data, axis=1)
