from __future__ import annotations

import argparse
import json
from pathlib import Path

from neuromirror.config import ReplayConfig
from neuromirror.openneuro_replay import DEFAULT_ACQUISITION, DEFAULT_DATASET, DEFAULT_SESSION, DEFAULT_SUBJECT
from neuromirror.processing.filters import bandpass
from neuromirror.replay import print_replay, replay_frames
from neuromirror.synthetic import generate_eyes_open_closed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Replay EEG-like streams through NeuroMirror.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    replay = subparsers.add_parser("replay", help="Replay an EEG source as newline-delimited JSON.")
    replay.add_argument("--source", choices=["synthetic", "openneuro"], default="synthetic")
    replay.add_argument("--seconds", type=float, default=12.0)
    replay.add_argument("--speed", type=float, default=1.0)
    replay.add_argument("--realtime", action="store_true")
    replay.add_argument("--seed", type=int, default=7)
    replay.add_argument("--dataset-root", type=Path, default=Path("data/openneuro/ds005385"))
    replay.add_argument("--subject", default=DEFAULT_SUBJECT)

    dashboard = subparsers.add_parser("dashboard", help="Run the local NeuroMirror visual dashboard.")
    dashboard.add_argument("--host", default="127.0.0.1")
    dashboard.add_argument("--port", type=int, default=8765)

    fetch = subparsers.add_parser("fetch-openneuro", help="Download one OpenNeuro subject for real EEG replay.")
    fetch.add_argument("--dataset", default=DEFAULT_DATASET)
    fetch.add_argument("--subject", default=DEFAULT_SUBJECT)
    fetch.add_argument("--session", default=DEFAULT_SESSION)
    fetch.add_argument("--acquisition", default=DEFAULT_ACQUISITION)
    fetch.add_argument("--target-dir", type=Path, default=Path("data/openneuro"))

    cohort = subparsers.add_parser("cohort-openneuro", help="Run Experiment 001 across local OpenNeuro subjects.")
    cohort.add_argument("--dataset-root", type=Path, default=Path("data/openneuro/ds005385"))
    cohort.add_argument("--subjects", nargs="*", default=None)
    cohort.add_argument("--session", default=DEFAULT_SESSION)
    cohort.add_argument("--acquisition", default=DEFAULT_ACQUISITION)
    cohort.add_argument("--seconds-per-state", type=float, default=12.0)
    cohort.add_argument("--report-dir", type=Path, default=None)
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "replay":
        config = ReplayConfig(speed=args.speed)
        if args.source == "openneuro":
            from neuromirror.openneuro_replay import load_openneuro_replay

            data, times, labels = load_openneuro_replay(
                config,
                dataset_root=args.dataset_root,
                subject=args.subject,
                seconds_per_state=args.seconds / 2,
            )
        else:
            data, times, labels = generate_eyes_open_closed(config, seconds=args.seconds, seed=args.seed)
            data = bandpass(data, sample_rate_hz=config.sample_rate_hz)
        frames = replay_frames(data, times, labels, config)
        print_replay(frames, config, realtime=args.realtime)

    if args.command == "dashboard":
        from neuromirror.server import run_dashboard

        run_dashboard(host=args.host, port=args.port)

    if args.command == "fetch-openneuro":
        from neuromirror.openneuro_replay import fetch_openneuro_subset, recording_paths

        print(f"Fetching {args.dataset} subject {args.subject} ({args.acquisition})")
        for path in recording_paths(args.dataset, args.subject, args.session, args.acquisition):
            print(f"  include {path}")
        dataset_root = fetch_openneuro_subset(
            dataset=args.dataset,
            subject=args.subject,
            session=args.session,
            acquisition=args.acquisition,
            target_dir=args.target_dir,
        )
        print(f"OpenNeuro subset ready at {dataset_root}")

    if args.command == "cohort-openneuro":
        from neuromirror.cohort import analyze_openneuro_cohort
        from neuromirror.reporting import write_cohort_report

        summary = analyze_openneuro_cohort(
            dataset_root=args.dataset_root,
            subjects=args.subjects,
            session=args.session,
            acquisition=args.acquisition,
            seconds_per_state=args.seconds_per_state,
        )
        if args.report_dir is not None:
            json_path, markdown_path = write_cohort_report(summary, args.report_dir, args.dataset_root.name)
            summary["report_paths"] = {"json": str(json_path), "markdown": str(markdown_path)}
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
