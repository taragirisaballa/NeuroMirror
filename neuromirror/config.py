from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReplayConfig:
    sample_rate_hz: int = 256
    channels: tuple[str, ...] = ("Fp1", "Fp2", "C3", "C4", "O1", "O2")
    window_seconds: float = 2.0
    step_seconds: float = 0.25
    speed: float = 1.0

    @property
    def window_samples(self) -> int:
        return int(self.sample_rate_hz * self.window_seconds)

    @property
    def step_samples(self) -> int:
        return int(self.sample_rate_hz * self.step_seconds)
