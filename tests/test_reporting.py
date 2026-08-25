from neuromirror.reporting import cohort_report_markdown, motor_imagery_cohort_report_markdown, motor_imagery_report_markdown


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


def test_motor_imagery_report_markdown_summarizes_contralateral_evidence() -> None:
    analysis = {
        "experiment_id": "motor-imagery-left-right-v1",
        "clean_windows": 1493,
        "artifact_windows": 0,
        "min_suppression_db": 0.5,
        "comparisons": {
            "left_imagery_C4_mu": {
                "state": "left_fist_imagery",
                "channels": ["C4"],
                "band": "alpha",
                "rest_median_uv2": 83.089,
                "task_median_uv2": 79.625,
                "ratio_task_rest": 0.958,
                "db_change": -0.18,
                "rest_windows": 181,
                "task_windows": 129,
            },
            "right_imagery_C3_mu": {
                "state": "right_fist_imagery",
                "channels": ["C3"],
                "band": "alpha",
                "rest_median_uv2": 112.67,
                "task_median_uv2": 59.689,
                "ratio_task_rest": 0.53,
                "db_change": -2.76,
                "rest_windows": 64,
                "task_windows": 8,
            },
        },
        "primary_result": {
            "supported": False,
            "summary": "The expected bilateral contralateral mu suppression pattern was not consistently present.",
        },
    }

    markdown = motor_imagery_report_markdown(analysis, "physionet-eegbci", "001")

    assert "# NeuroMirror Motor Imagery Report" in markdown
    assert "Primary result: `not consistently present`" in markdown
    assert "Right fist imagery" in markdown
    assert "C3" in markdown
    assert "-2.76 dB" in markdown


def test_motor_imagery_cohort_report_markdown_summarizes_subject_variability() -> None:
    summary = {
        "experiment_id": "motor-imagery-left-right-v1",
        "subject_count": 2,
        "bilateral_subject_count": 1,
        "partial_subject_count": 1,
        "not_consistent_subject_count": 0,
        "insufficient_subject_count": 0,
        "skipped_subject_count": 0,
        "group": {
            "median_left_mu_db": -0.715,
            "iqr_left_mu_db": [-0.982, -0.448],
            "median_right_mu_db": -2.155,
            "iqr_right_mu_db": [-2.458, -1.852],
        },
        "subjects": [
            {
                "subject": "001",
                "support_level": "right_only",
                "left_mu_db": -0.18,
                "right_mu_db": -2.76,
                "left_beta_db": 0.0,
                "right_beta_db": -1.15,
                "clean_windows": 1493,
                "artifact_windows": 0,
                "rest_windows": 181,
                "left_windows": 129,
                "right_windows": 8,
            },
            {
                "subject": "002",
                "support_level": "bilateral",
                "left_mu_db": -1.25,
                "right_mu_db": -1.55,
                "left_beta_db": -0.4,
                "right_beta_db": -0.6,
                "clean_windows": 1501,
                "artifact_windows": 0,
                "rest_windows": 180,
                "left_windows": 120,
                "right_windows": 120,
            },
        ],
        "skipped": [],
    }

    markdown = motor_imagery_cohort_report_markdown(summary, "physionet-eegbci")

    assert "# NeuroMirror Motor Imagery Cohort Report" in markdown
    assert "Bilateral pattern present: `1/2`" in markdown
    assert "`sub-001`" in markdown
    assert "right only" in markdown
    assert "Median right-imagery C3 mu change" in markdown
