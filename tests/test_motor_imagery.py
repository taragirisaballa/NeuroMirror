from neuromirror.experiments.motor_imagery import motor_imagery_analysis
from neuromirror.motor_cohort import MotorSubjectEvidence, motor_cohort_summary, support_level_label
from neuromirror.physionet_mi import annotation_label


def test_motor_imagery_analysis_detects_contralateral_mu_suppression() -> None:
    frames = []
    for state, c3_alpha, c4_alpha in [
        ("rest", 10.0, 10.0),
        ("rest", 12.0, 12.0),
        ("rest", 11.0, 11.0),
        ("rest", 10.0, 10.0),
        ("rest", 12.0, 12.0),
        ("left_fist_imagery", 10.0, 4.0),
        ("left_fist_imagery", 9.0, 3.0),
        ("left_fist_imagery", 11.0, 4.0),
        ("left_fist_imagery", 10.0, 5.0),
        ("left_fist_imagery", 12.0, 4.0),
        ("right_fist_imagery", 4.0, 10.0),
        ("right_fist_imagery", 3.0, 9.0),
        ("right_fist_imagery", 4.0, 11.0),
        ("right_fist_imagery", 5.0, 10.0),
        ("right_fist_imagery", 4.0, 12.0),
    ]:
        frames.append(
            {
                "state": state,
                "features": {
                    "C3": {"alpha": c3_alpha * 1e-12, "beta": 8e-12},
                    "C4": {"alpha": c4_alpha * 1e-12, "beta": 8e-12},
                },
                "summary": {
                    "blink_like_artifact": False,
                    "channel_quality": {"C3": "ok", "C4": "ok"},
                },
            }
        )

    analysis = motor_imagery_analysis(frames)

    assert analysis["experiment_id"] == "motor-imagery-left-right-v1"
    assert analysis["primary_result"]["supported"] is True
    assert analysis["comparisons"]["left_imagery_C4_mu"]["ratio_task_rest"] < 1.0
    assert analysis["comparisons"]["right_imagery_C3_mu"]["ratio_task_rest"] < 1.0


def test_annotation_label_maps_physionet_event_codes() -> None:
    assert annotation_label("T0") == "rest"
    assert annotation_label("T1") == "left_fist_imagery"
    assert annotation_label("T2") == "right_fist_imagery"
    assert annotation_label("BAD boundary") is None


def test_support_level_label_classifies_bilateral_and_partial_patterns() -> None:
    assert support_level_label(True, True) == "bilateral"
    assert support_level_label(True, False) == "left_only"
    assert support_level_label(False, True) == "right_only"
    assert support_level_label(False, False) == "not_consistent"


def test_motor_cohort_summary_counts_group_patterns() -> None:
    evidence = [
        MotorSubjectEvidence(
            subject="001",
            supported=False,
            support_level="right_only",
            left_mu_ratio=0.96,
            left_mu_db=-0.18,
            right_mu_ratio=0.53,
            right_mu_db=-2.76,
            left_beta_db=0.0,
            right_beta_db=-1.15,
            clean_windows=1493,
            artifact_windows=0,
            rest_windows=181,
            left_windows=129,
            right_windows=8,
            summary="One-sided pattern.",
        ),
        MotorSubjectEvidence(
            subject="002",
            supported=True,
            support_level="bilateral",
            left_mu_ratio=0.75,
            left_mu_db=-1.25,
            right_mu_ratio=0.7,
            right_mu_db=-1.55,
            left_beta_db=-0.4,
            right_beta_db=-0.6,
            clean_windows=1501,
            artifact_windows=0,
            rest_windows=180,
            left_windows=120,
            right_windows=120,
            summary="Bilateral pattern.",
        ),
        MotorSubjectEvidence(
            subject="003",
            supported=False,
            support_level="insufficient_data",
            left_mu_ratio=2.0,
            left_mu_db=3.0,
            right_mu_ratio=2.0,
            right_mu_db=3.0,
            left_beta_db=1.0,
            right_beta_db=1.0,
            clean_windows=10,
            artifact_windows=0,
            rest_windows=2,
            left_windows=2,
            right_windows=2,
            summary="Not enough windows.",
        ),
    ]

    summary = motor_cohort_summary(evidence, [])

    assert summary["subject_count"] == 3
    assert summary["bilateral_subject_count"] == 1
    assert summary["partial_subject_count"] == 1
    assert summary["not_consistent_subject_count"] == 0
    assert summary["insufficient_subject_count"] == 1
    assert summary["group"]["median_right_mu_db"] == -2.155
