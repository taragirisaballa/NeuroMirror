from __future__ import annotations

import numpy as np

from neuromirror.experiments.base import ExperimentPreset, Frame


LEFT_RIGHT_MOTOR_IMAGERY = ExperimentPreset(
    experiment_id="motor-imagery-left-right-v1",
    name="Left vs Right Motor Imagery",
    description="Experiment 002: contralateral sensorimotor mu/beta suppression during left/right hand imagery.",
    build_payloads=lambda frames: {
        "experiment": motor_imagery_analysis(frames),
    },
)


def motor_imagery_analysis(
    frames: list[Frame],
    min_state_windows: int = 5,
    min_suppression_db: float = 0.5,
) -> dict[str, object]:
    comparisons = {
        "left_imagery_C4_mu": erd_comparison(frames, "left_fist_imagery", ("C4",), "alpha"),
        "right_imagery_C3_mu": erd_comparison(frames, "right_fist_imagery", ("C3",), "alpha"),
        "left_imagery_C4_beta": erd_comparison(frames, "left_fist_imagery", ("C4",), "beta"),
        "right_imagery_C3_beta": erd_comparison(frames, "right_fist_imagery", ("C3",), "beta"),
        "left_imagery_C3_mu": erd_comparison(frames, "left_fist_imagery", ("C3",), "alpha"),
        "right_imagery_C4_mu": erd_comparison(frames, "right_fist_imagery", ("C4",), "alpha"),
    }
    left_mu = comparisons["left_imagery_C4_mu"]
    right_mu = comparisons["right_imagery_C3_mu"]
    usable_windows = count_state_windows(frames, ("rest", "left_fist_imagery", "right_fist_imagery"))
    artifact_windows = sum(1 for frame in frames if bool(frame["summary"].get("blink_like_artifact")))
    supported = bool(
        is_suppressed(left_mu, min_state_windows, min_suppression_db)
        and is_suppressed(right_mu, min_state_windows, min_suppression_db)
    )
    return {
        "experiment_id": LEFT_RIGHT_MOTOR_IMAGERY.experiment_id,
        "name": LEFT_RIGHT_MOTOR_IMAGERY.name,
        "clean_windows": usable_windows,
        "excluded_windows": len(frames) - usable_windows,
        "artifact_windows": artifact_windows,
        "total_windows": len(frames),
        "min_state_windows": min_state_windows,
        "min_suppression_db": min_suppression_db,
        "window_rule": "motor imagery comparisons use windows where the requested C3/C4 channel is marked ok",
        "comparisons": comparisons,
        "primary_result": {
            "label": "Contralateral mu suppression",
            "band": "mu/alpha",
            "channels": ["C3", "C4"],
            "supported": supported,
            "summary": motor_imagery_summary(left_mu, right_mu, min_state_windows, min_suppression_db),
        },
    }


def erd_comparison(
    frames: list[Frame],
    task_state: str,
    channels: tuple[str, ...],
    band: str,
) -> dict[str, float | int | None | str | list[str]]:
    rest_values = state_band_values(frames, "rest", channels, band)
    task_values = state_band_values(frames, task_state, channels, band)
    rest_median = median_or_none(rest_values)
    task_median = median_or_none(task_values)
    ratio_task_rest = None
    db_change = None
    percent_change = None
    if rest_median is not None and task_median is not None and rest_median > 0:
        ratio_task_rest = task_median / rest_median
        db_change = 10.0 * np.log10(ratio_task_rest)
        percent_change = ((task_median - rest_median) / rest_median) * 100.0
    return {
        "state": task_state,
        "channels": list(channels),
        "band": band,
        "rest_median_uv2": round(rest_median * 1e12, 3) if rest_median is not None else None,
        "task_median_uv2": round(task_median * 1e12, 3) if task_median is not None else None,
        "rest_iqr_uv2": iqr_uv2_or_none(rest_values),
        "task_iqr_uv2": iqr_uv2_or_none(task_values),
        "ratio_task_rest": round(ratio_task_rest, 3) if ratio_task_rest is not None else None,
        "db_change": round(float(db_change), 2) if db_change is not None else None,
        "percent_change": round(percent_change, 1) if percent_change is not None else None,
        "rest_windows": len(rest_values),
        "task_windows": len(task_values),
    }


def state_band_values(
    frames: list[Frame],
    state: str,
    channels: tuple[str, ...],
    band: str,
) -> list[float]:
    values: list[float] = []
    for frame in frames:
        if frame["state"] != state:
            continue
        qualities = dict(frame["summary"].get("channel_quality", {}))
        if any(qualities.get(channel) != "ok" for channel in channels):
            continue
        channel_values = [frame["features"].get(channel, {}).get(band) for channel in channels]
        channel_values = [value for value in channel_values if value is not None]
        if channel_values:
            values.append(float(np.mean(channel_values)))
    return values


def count_state_windows(frames: list[Frame], states: tuple[str, ...]) -> int:
    return sum(1 for frame in frames if frame["state"] in states)


def is_suppressed(comparison: dict[str, object], min_state_windows: int, min_suppression_db: float = 0.5) -> bool:
    ratio = optional_float(comparison.get("ratio_task_rest"))
    db_change = optional_float(comparison.get("db_change"))
    return bool(
        ratio is not None
        and db_change is not None
        and ratio < 1.0
        and db_change <= -abs(min_suppression_db)
        and int(comparison.get("rest_windows") or 0) >= min_state_windows
        and int(comparison.get("task_windows") or 0) >= min_state_windows
    )


def motor_imagery_summary(
    left_mu: dict[str, object],
    right_mu: dict[str, object],
    min_state_windows: int,
    min_suppression_db: float,
) -> str:
    if not is_complete(left_mu, min_state_windows) or not is_complete(right_mu, min_state_windows):
        return "Not enough usable rest, left-imagery, and right-imagery windows to support a motor-imagery conclusion."

    left_ratio = float(left_mu["ratio_task_rest"])
    left_db = float(left_mu["db_change"])
    right_ratio = float(right_mu["ratio_task_rest"])
    right_db = float(right_mu["db_change"])
    if is_suppressed(left_mu, min_state_windows, min_suppression_db) and is_suppressed(
        right_mu,
        min_state_windows,
        min_suppression_db,
    ):
        return (
            "Contralateral mu power decreased during motor imagery "
            f"(left imagery C4 {left_ratio:.2f}x, {left_db:+.2f} dB; "
            f"right imagery C3 {right_ratio:.2f}x, {right_db:+.2f} dB)."
        )
    return (
        "The expected bilateral contralateral mu suppression pattern was not consistently present "
        f"(left imagery C4 {left_ratio:.2f}x, {left_db:+.2f} dB; "
        f"right imagery C3 {right_ratio:.2f}x, {right_db:+.2f} dB)."
    )


def is_complete(comparison: dict[str, object], min_state_windows: int) -> bool:
    return bool(
        comparison.get("ratio_task_rest") is not None
        and comparison.get("db_change") is not None
        and int(comparison.get("rest_windows") or 0) >= min_state_windows
        and int(comparison.get("task_windows") or 0) >= min_state_windows
    )


def optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def median_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.median(values))


def iqr_uv2_or_none(values: list[float]) -> list[float] | None:
    if not values:
        return None
    q1, q3 = np.percentile(np.asarray(values, dtype=float), [25, 75])
    return [round(float(q1 * 1e12), 3), round(float(q3 * 1e12), 3)]
