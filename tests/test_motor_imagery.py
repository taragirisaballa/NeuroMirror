from neuromirror.experiments.motor_imagery import motor_imagery_analysis
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
