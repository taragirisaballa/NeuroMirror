from neuromirror.reporting import cohort_report_markdown


def test_cohort_report_markdown_summarizes_group_and_subjects() -> None:
    summary = {
        "experiment_id": "resting-state-eyes-open-closed-v1",
        "subject_count": 2,
        "supported_subject_count": 2,
        "skipped_subject_count": 0,
        "group": {
            "median_ratio_closed_open": 9.39,
            "iqr_ratio_closed_open": [5.795, 11.745],
            "median_db_change": 9.625,
            "iqr_db_change": [6.59, 10.697],
        },
        "subjects": [
            {
                "subject": "001",
                "supported": True,
                "ratio_closed_open": 12.732,
                "db_change": 11.05,
                "open_windows": 41,
                "closed_windows": 48,
                "usable_windows": 89,
                "artifact_windows": 42,
            },
            {
                "subject": "003",
                "supported": True,
                "ratio_closed_open": 1.085,
                "db_change": 0.35,
                "open_windows": 41,
                "closed_windows": 48,
                "usable_windows": 89,
                "artifact_windows": 38,
            },
        ],
        "skipped": [],
    }

    markdown = cohort_report_markdown(summary, "ds005385")

    assert "# NeuroMirror Cohort Report" in markdown
    assert "Dataset: `ds005385`" in markdown
    assert "Subjects supporting posterior alpha increase: `2/2`" in markdown
    assert "`sub-001`" in markdown
    assert "`sub-003`" in markdown
    assert "Weak positive responders" in markdown

