from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


Frame = dict[str, object]
ExperimentPayloads = dict[str, object]


@dataclass(frozen=True)
class ExperimentPreset:
    experiment_id: str
    name: str
    description: str
    build_payloads: Callable[[list[Frame]], ExperimentPayloads]

