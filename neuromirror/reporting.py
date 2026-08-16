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
