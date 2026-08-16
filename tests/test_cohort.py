from pathlib import Path

from neuromirror.cohort import SkippedSubject, SubjectEvidence, cohort_summary, local_subjects


def test_local_subjects_discovers_bids_subject_directories(tmp_path: Path) -> None:
    (tmp_path / "sub-002").mkdir()
    (tmp_path / "sub-001").mkdir()
    (tmp_path / "derivatives").mkdir()

    assert local_subjects(tmp_path) == ["001", "002"]


def test_cohort_summary_reports_group_effects() -> None:
    evidence = [
        SubjectEvidence(
            subject="001",
            supported=True,
            ratio_closed_open=12.7,
            db_change=11.0,
            open_windows=41,
            closed_windows=48,
            usable_windows=89,
            artifact_windows=42,
            summary="Posterior alpha increased.",
        ),
        SubjectEvidence(
            subject="002",
            supported=True,
            ratio_closed_open=4.1,
            db_change=6.1,
            open_windows=38,
            closed_windows=45,
            usable_windows=83,
            artifact_windows=12,
            summary="Posterior alpha increased.",
        ),
    ]

    summary = cohort_summary(evidence, [SkippedSubject(subject="003", reason="missing EDF")])

    assert summary["subject_count"] == 2
    assert summary["supported_subject_count"] == 2
    assert summary["skipped_subject_count"] == 1
    assert summary["group"]["median_ratio_closed_open"] == 8.4
    assert summary["group"]["iqr_db_change"] == [7.325, 9.775]

