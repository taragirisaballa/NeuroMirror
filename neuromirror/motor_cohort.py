from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.experiments.motor_imagery import LEFT_RIGHT_MOTOR_IMAGERY, is_complete, is_suppressed, optional_float
from neuromirror.physionet_mi import DEFAULT_MOTOR_IMAGERY_RUNS, MOTOR_IMAGERY_CHANNELS, load_physionet_motor_imagery_replay
from neuromirror.replay import replay_frames

DEFAULT_MOTOR_COHORT_SUBJECTS = ("001", "002", "003", "004", "005")


@dataclass(frozen=True)
class MotorSubjectEvidence:
    subject: str
    supported: bool
    support_level: str
    left_mu_ratio: float | None
    left_mu_db: float | None
    right_mu_ratio: float | None
    right_mu_db: float | None
    left_beta_db: float | None
    right_beta_db: float | None
    clean_windows: int
    artifact_windows: int
    rest_windows: int
    left_windows: int
    right_windows: int
    summary: str


@dataclass(frozen=True)
class SkippedMotorSubject:
    subject: str
    reason: str


def analyze_physionet_motor_imagery_cohort(
    dataset_root: Path,
    subjects: list[str] | None = None,
    runs: tuple[int, ...] = DEFAULT_MOTOR_IMAGERY_RUNS,
    config: ReplayConfig | None = None,
) -> dict[str, object]:
    config = config or ReplayConfig(channels=MOTOR_IMAGERY_CHANNELS, sample_rate_hz=160)
    selected_subjects = subjects or list(DEFAULT_MOTOR_COHORT_SUBJECTS)
    evidence: list[MotorSubjectEvidence] = []
    skipped: list[SkippedMotorSubject] = []

    for subject in selected_subjects:
        try:
            data, times, labels = load_physionet_motor_imagery_replay(
                config,
                dataset_root=dataset_root,
                subject=subject,
                runs=runs,
            )
            frames = list(replay_frames(data, times, labels, config, experiment_preset=LEFT_RIGHT_MOTOR_IMAGERY))
            evidence.append(motor_subject_evidence(subject, frames))
        except Exception as exc:
            skipped.append(SkippedMotorSubject(subject=subject, reason=str(exc)))

    return motor_cohort_summary(evidence, skipped)


def motor_subject_evidence(subject: str, frames: list[dict[str, object]]) -> MotorSubjectEvidence:
    if not frames:
        return MotorSubjectEvidence(
            subject=subject,
            supported=False,
            support_level="insufficient_data",
            left_mu_ratio=None,
            left_mu_db=None,
            right_mu_ratio=None,
            right_mu_db=None,
            left_beta_db=None,
            right_beta_db=None,
            clean_windows=0,
            artifact_windows=0,
            rest_windows=0,
            left_windows=0,
            right_windows=0,
            summary="No replay frames were produced.",
        )

    experiment = dict(frames[0].get("experiment", {}))
    comparisons = dict(experiment.get("comparisons", {}))
    left_mu = dict(comparisons.get("left_imagery_C4_mu", {}))
    right_mu = dict(comparisons.get("right_imagery_C3_mu", {}))
    left_beta = dict(comparisons.get("left_imagery_C4_beta", {}))
    right_beta = dict(comparisons.get("right_imagery_C3_beta", {}))
    min_windows = int(experiment.get("min_state_windows") or 5)
    min_db = float(experiment.get("min_suppression_db") or 0.5)
    if is_complete(left_mu, min_windows) and is_complete(right_mu, min_windows):
        left_supported = is_suppressed(left_mu, min_windows, min_db)
        right_supported = is_suppressed(right_mu, min_windows, min_db)
        support_level = support_level_label(left_supported, right_supported)
    else:
        support_level = "insufficient_data"

    return MotorSubjectEvidence(
        subject=subject,
        supported=support_level == "bilateral",
        support_level=support_level,
        left_mu_ratio=optional_float(left_mu.get("ratio_task_rest")),
        left_mu_db=optional_float(left_mu.get("db_change")),
        right_mu_ratio=optional_float(right_mu.get("ratio_task_rest")),
        right_mu_db=optional_float(right_mu.get("db_change")),
        left_beta_db=optional_float(left_beta.get("db_change")),
        right_beta_db=optional_float(right_beta.get("db_change")),
        clean_windows=int(experiment.get("clean_windows") or 0),
        artifact_windows=int(experiment.get("artifact_windows") or 0),
        rest_windows=max(int(left_mu.get("rest_windows") or 0), int(right_mu.get("rest_windows") or 0)),
        left_windows=int(left_mu.get("task_windows") or 0),
        right_windows=int(right_mu.get("task_windows") or 0),
        summary=str(dict(experiment.get("primary_result", {})).get("summary") or "No primary result."),
    )


def support_level_label(left_supported: bool, right_supported: bool) -> str:
    if left_supported and right_supported:
        return "bilateral"
    if left_supported:
        return "left_only"
    if right_supported:
        return "right_only"
    return "not_consistent"


def motor_cohort_summary(
    evidence: list[MotorSubjectEvidence],
    skipped: list[SkippedMotorSubject],
) -> dict[str, object]:
    bilateral = [item for item in evidence if item.support_level == "bilateral"]
    partial = [item for item in evidence if item.support_level in {"left_only", "right_only"}]
    not_consistent = [item for item in evidence if item.support_level == "not_consistent"]
    insufficient = [item for item in evidence if item.support_level == "insufficient_data"]
    analyzable = [item for item in evidence if item.support_level != "insufficient_data"]
    left_mu_db = [item.left_mu_db for item in analyzable if item.left_mu_db is not None]
    right_mu_db = [item.right_mu_db for item in analyzable if item.right_mu_db is not None]
    left_ratios = [item.left_mu_ratio for item in analyzable if item.left_mu_ratio is not None]
    right_ratios = [item.right_mu_ratio for item in analyzable if item.right_mu_ratio is not None]
    return {
        "experiment_id": LEFT_RIGHT_MOTOR_IMAGERY.experiment_id,
        "subject_count": len(evidence),
        "bilateral_subject_count": len(bilateral),
        "partial_subject_count": len(partial),
        "not_consistent_subject_count": len(not_consistent),
        "insufficient_subject_count": len(insufficient),
        "skipped_subject_count": len(skipped),
        "group": {
            "median_left_mu_ratio": rounded_median(left_ratios),
            "iqr_left_mu_ratio": rounded_iqr(left_ratios),
            "median_right_mu_ratio": rounded_median(right_ratios),
            "iqr_right_mu_ratio": rounded_iqr(right_ratios),
            "median_left_mu_db": rounded_median(left_mu_db),
            "iqr_left_mu_db": rounded_iqr(left_mu_db),
            "median_right_mu_db": rounded_median(right_mu_db),
            "iqr_right_mu_db": rounded_iqr(right_mu_db),
        },
        "subjects": [item.__dict__ for item in evidence],
        "skipped": [item.__dict__ for item in skipped],
    }


def rounded_median(values: list[float]) -> float | None:
    if not values:
        return None
    return round(float(np.median(np.asarray(values, dtype=float))), 3)


def rounded_iqr(values: list[float]) -> list[float] | None:
    if not values:
        return None
    q1, q3 = np.percentile(np.asarray(values, dtype=float), [25, 75])
    return [round(float(q1), 3), round(float(q3), 3)]
