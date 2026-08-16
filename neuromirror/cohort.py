from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.openneuro_replay import DEFAULT_ACQUISITION, DEFAULT_SESSION, load_openneuro_replay
from neuromirror.replay import replay_frames


@dataclass(frozen=True)
class SubjectEvidence:
    subject: str
    supported: bool
    ratio_closed_open: float | None
    db_change: float | None
    open_windows: int
    closed_windows: int
    usable_windows: int
    artifact_windows: int
    summary: str


@dataclass(frozen=True)
class SkippedSubject:
    subject: str
    reason: str


def local_subjects(dataset_root: Path) -> list[str]:
    return sorted(path.name.removeprefix("sub-") for path in dataset_root.glob("sub-*") if path.is_dir())


def analyze_openneuro_cohort(
    dataset_root: Path,
    subjects: list[str] | None = None,
    session: str = DEFAULT_SESSION,
    acquisition: str = DEFAULT_ACQUISITION,
    seconds_per_state: float = 12.0,
    config: ReplayConfig | None = None,
) -> dict[str, object]:
    config = config or ReplayConfig()
    selected_subjects = subjects or local_subjects(dataset_root)
    evidence: list[SubjectEvidence] = []
    skipped: list[SkippedSubject] = []

    for subject in selected_subjects:
        try:
            data, times, labels = load_openneuro_replay(
                config,
                dataset_root=dataset_root,
                subject=subject,
                session=session,
                acquisition=acquisition,
                seconds_per_state=seconds_per_state,
            )
            frames = list(replay_frames(data, times, labels, config))
            evidence.append(subject_evidence(subject, frames))
        except Exception as exc:
            skipped.append(SkippedSubject(subject=subject, reason=str(exc)))

    return cohort_summary(evidence, skipped)


def subject_evidence(subject: str, frames: list[dict[str, object]]) -> SubjectEvidence:
    if not frames:
        return SubjectEvidence(
            subject=subject,
            supported=False,
            ratio_closed_open=None,
            db_change=None,
            open_windows=0,
            closed_windows=0,
            usable_windows=0,
            artifact_windows=0,
            summary="No replay frames were produced.",
        )

    experiment = dict(frames[0].get("experiment", {}))
    posterior = dict(dict(experiment.get("comparisons", {})).get("posterior_alpha", {}))
    primary = dict(experiment.get("primary_result", {}))
    return SubjectEvidence(
        subject=subject,
        supported=bool(primary.get("supported")),
        ratio_closed_open=optional_float(posterior.get("ratio_closed_open")),
        db_change=optional_float(posterior.get("db_change")),
        open_windows=int(posterior.get("open_windows") or 0),
        closed_windows=int(posterior.get("closed_windows") or 0),
        usable_windows=int(experiment.get("clean_windows") or 0),
        artifact_windows=int(experiment.get("artifact_windows") or 0),
        summary=str(primary.get("summary") or "No primary result."),
    )


def cohort_summary(evidence: list[SubjectEvidence], skipped: list[SkippedSubject]) -> dict[str, object]:
    ratios = [item.ratio_closed_open for item in evidence if item.ratio_closed_open is not None]
    db_changes = [item.db_change for item in evidence if item.db_change is not None]
    supported = [item for item in evidence if item.supported]
    return {
        "experiment_id": "resting-state-eyes-open-closed-v1",
        "subject_count": len(evidence),
        "supported_subject_count": len(supported),
        "skipped_subject_count": len(skipped),
        "group": {
            "median_ratio_closed_open": rounded_median(ratios),
            "iqr_ratio_closed_open": rounded_iqr(ratios),
            "median_db_change": rounded_median(db_changes),
            "iqr_db_change": rounded_iqr(db_changes),
        },
        "subjects": [item.__dict__ for item in evidence],
        "skipped": [item.__dict__ for item in skipped],
    }


def optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def rounded_median(values: list[float]) -> float | None:
    if not values:
        return None
    return round(float(np.median(np.asarray(values, dtype=float))), 3)


def rounded_iqr(values: list[float]) -> list[float] | None:
    if not values:
        return None
    q1, q3 = np.percentile(np.asarray(values, dtype=float), [25, 75])
    return [round(float(q1), 3), round(float(q3), 3)]

