from __future__ import annotations

import json
from pathlib import Path


def write_cohort_report(summary: dict[str, object], output_dir: Path, dataset: str) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    experiment_id = str(summary["experiment_id"])
    stem = f"cohort-{dataset}-{experiment_id}"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"

    json_path.write_text(json.dumps(summary, indent=2) + "\n")
    markdown_path.write_text(cohort_report_markdown(summary, dataset))
    return json_path, markdown_path


def write_motor_imagery_report(
    analysis: dict[str, object],
    output_dir: Path,
    dataset: str,
    subject: str,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    experiment_id = str(analysis["experiment_id"])
    stem = f"subject-{subject}-{dataset}-{experiment_id}"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"

    json_path.write_text(json.dumps(analysis, indent=2) + "\n")
    markdown_path.write_text(motor_imagery_report_markdown(analysis, dataset, subject))
    return json_path, markdown_path


def cohort_report_markdown(summary: dict[str, object], dataset: str) -> str:
    group = dict(summary.get("group", {}))
    subjects = list(summary.get("subjects", []))
    skipped = list(summary.get("skipped", []))
    subject_count = int(summary.get("subject_count") or 0)
    supported_count = int(summary.get("supported_subject_count") or 0)
    skipped_count = int(summary.get("skipped_subject_count") or 0)
    weak_subjects = [
        subject for subject in subjects if optional_float(dict(subject).get("ratio_closed_open")) is not None
        and optional_float(dict(subject).get("ratio_closed_open")) < 2.0
    ]

    lines = [
        "# NeuroMirror Cohort Report",
        "",
        f"- Dataset: `{dataset}`",
        f"- Experiment: `{summary['experiment_id']}`",
        f"- Subjects analyzed: `{subject_count}`",
        f"- Subjects supporting posterior alpha increase: `{supported_count}/{subject_count}`",
        f"- Skipped subjects: `{skipped_count}`",
        "",
        "## Group Result",
        "",
        f"- Median closed/open ratio: `{format_optional(group.get('median_ratio_closed_open'), 'x')}`",
        f"- Ratio IQR: `{format_iqr(group.get('iqr_ratio_closed_open'), 'x')}`",
        f"- Median dB change: `{format_optional(group.get('median_db_change'), ' dB', signed=True)}`",
        f"- dB IQR: `{format_iqr(group.get('iqr_db_change'), ' dB', signed=True)}`",
        "",
        "## Interpretation",
        "",
        interpretation(summary, weak_subjects),
        "",
        "## Subject Results",
        "",
        "| Subject | Supported | Closed/Open | dB Change | Open Windows | Closed Windows | Usable Windows | Artifact-Flagged |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for subject in subjects:
        item = dict(subject)
        lines.append(
            "| "
            f"`sub-{item['subject']}` | "
            f"{'yes' if item['supported'] else 'no'} | "
            f"{format_optional(item.get('ratio_closed_open'), 'x')} | "
            f"{format_optional(item.get('db_change'), ' dB', signed=True)} | "
            f"{item['open_windows']} | "
            f"{item['closed_windows']} | "
            f"{item['usable_windows']} | "
            f"{item['artifact_windows']} |"
        )

    lines.extend(["", "## Notes", ""])
    lines.append(
        "This report summarizes Experiment 001 across locally fetched OpenNeuro subjects. "
        "The group result is based on posterior O1/O2 alpha bandpower using the same replay windows, PSD, "
        "bandpower, artifact, and experiment-preset pipeline as the live NeuroMirror dashboard."
    )

    if weak_subjects:
        weak_labels = ", ".join(f"`sub-{dict(subject)['subject']}`" for subject in weak_subjects)
        lines.append(
            f"Weak positive responders: {weak_labels}. "
            "These subjects increase the scientific value of the cohort by exposing subject-to-subject variability."
        )

    if skipped:
        lines.extend(["", "## Skipped Subjects", ""])
        for subject in skipped:
            item = dict(subject)
            lines.append(f"- `sub-{item['subject']}`: {item['reason']}")

    return "\n".join(lines) + "\n"


def motor_imagery_report_markdown(analysis: dict[str, object], dataset: str, subject: str) -> str:
    comparisons = dict(analysis.get("comparisons", {}))
    primary = dict(analysis.get("primary_result", {}))
    support_label = "pattern present" if primary.get("supported") else "not consistently present"
    lines = [
        "# NeuroMirror Motor Imagery Report",
        "",
        f"- Dataset: `{dataset}`",
        f"- Subject: `sub-{subject}`",
        f"- Experiment: `{analysis['experiment_id']}`",
        f"- Primary result: `{support_label}`",
        f"- Clean windows: `{analysis.get('clean_windows', 0)}`",
        f"- Artifact-flagged windows: `{analysis.get('artifact_windows', 0)}`",
        f"- Minimum suppression threshold: `{format_optional(analysis.get('min_suppression_db'), ' dB')}`",
        "",
        "## Interpretation",
        "",
        str(primary.get("summary") or "No motor-imagery conclusion was available."),
        "",
        "## Contralateral Sensorimotor Result",
        "",
        "| Task | Expected Channel | Band | Rest Median | Task Median | Task/Rest | dB Change | Rest Windows | Task Windows |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]

    for key in ("left_imagery_C4_mu", "right_imagery_C3_mu", "left_imagery_C4_beta", "right_imagery_C3_beta"):
        if key in comparisons:
            lines.append(motor_imagery_row(str(key), dict(comparisons[key])))

    lines.extend(
        [
            "",
            "## Ipsilateral Check",
            "",
            "| Task | Channel | Band | Task/Rest | dB Change |",
            "|---|---|---|---:|---:|",
        ]
    )
    for key in ("left_imagery_C3_mu", "right_imagery_C4_mu"):
        if key in comparisons:
            item = dict(comparisons[key])
            lines.append(
                "| "
                f"{motor_task_label(str(item.get('state')))} | "
                f"{', '.join(str(channel) for channel in item.get('channels', []))} | "
                f"{band_label(str(item.get('band')))} | "
                f"{format_optional(item.get('ratio_task_rest'), 'x')} | "
                f"{format_optional(item.get('db_change'), ' dB', signed=True)} |"
            )

    lines.extend(["", "## Notes", ""])
    lines.append(
        "This report summarizes Experiment 002 for one PhysioNet EEGBCI subject. "
        "Mu is represented by the existing 8-13 Hz alpha band over C3/C4. "
        "A supported result requires both expected contralateral comparisons to clear the dB suppression threshold; "
        "weak or one-sided effects are reported without being overclaimed."
    )
    return "\n".join(lines) + "\n"


def motor_imagery_row(key: str, item: dict[str, object]) -> str:
    return (
        "| "
        f"{motor_task_label(str(item.get('state')))} | "
        f"{', '.join(str(channel) for channel in item.get('channels', []))} | "
        f"{band_label(str(item.get('band')))} | "
        f"{format_optional(item.get('rest_median_uv2'), ' uV^2')} | "
        f"{format_optional(item.get('task_median_uv2'), ' uV^2')} | "
        f"{format_optional(item.get('ratio_task_rest'), 'x')} | "
        f"{format_optional(item.get('db_change'), ' dB', signed=True)} | "
        f"{item.get('rest_windows', 0)} | "
        f"{item.get('task_windows', 0)} |"
    )


def motor_task_label(state: str) -> str:
    return {
        "left_fist_imagery": "Left fist imagery",
        "right_fist_imagery": "Right fist imagery",
        "rest": "Rest",
    }.get(state, state)


def band_label(band: str) -> str:
    return "mu/alpha" if band == "alpha" else band


def interpretation(summary: dict[str, object], weak_subjects: list[object]) -> str:
    subject_count = int(summary.get("subject_count") or 0)
    supported_count = int(summary.get("supported_subject_count") or 0)
    group = dict(summary.get("group", {}))
    ratio = format_optional(group.get("median_ratio_closed_open"), "x")
    db = format_optional(group.get("median_db_change"), " dB", signed=True)
    if not subject_count:
        return "No local subjects were available for cohort analysis."
    sentence = (
        f"Across {subject_count} locally fetched subjects, {supported_count} showed posterior alpha increasing "
        f"during eyes closed. The group median effect was {ratio} ({db})."
    )
    if weak_subjects:
        sentence += " One or more subjects showed a weak effect, highlighting expected between-subject variability."
    return sentence


def optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def format_optional(value: object, suffix: str = "", signed: bool = False) -> str:
    number = optional_float(value)
    if number is None:
        return "n/a"
    sign = "+" if signed and number > 0 else ""
    return f"{sign}{number:.2f}{suffix}"


def format_iqr(value: object, suffix: str = "", signed: bool = False) -> str:
    if not isinstance(value, list) or len(value) != 2:
        return "n/a"
    return f"{format_optional(value[0], suffix, signed)} to {format_optional(value[1], suffix, signed)}"
