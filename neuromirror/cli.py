from __future__ import annotations

import argparse
import json
from pathlib import Path

from neuromirror.config import ReplayConfig
from neuromirror.openneuro_replay import DEFAULT_ACQUISITION, DEFAULT_DATASET, DEFAULT_SESSION, DEFAULT_SUBJECT
from neuromirror.physionet_mi import DEFAULT_MOTOR_IMAGERY_RUNS, DEFAULT_PHYSIONET_SUBJECT, MOTOR_IMAGERY_CHANNELS
from neuromirror.processing.filters import bandpass
from neuromirror.replay import print_replay, replay_frames
from neuromirror.synthetic import generate_eyes_open_closed


OPENNEURO_REPLAY_ROOT = Path("data/openneuro/ds005385")
PHYSIONET_REPLAY_ROOT = Path("data/physionet")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Replay EEG-like streams through NeuroMirror.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    replay = subparsers.add_parser("replay", help="Replay an EEG source as newline-delimited JSON.")
    replay.add_argument("--source", choices=["synthetic", "openneuro", "physionet-mi"], default="synthetic")
    replay.add_argument("--seconds", type=float, default=12.0)
    replay.add_argument("--speed", type=float, default=1.0)
    replay.add_argument("--realtime", action="store_true")
    replay.add_argument("--seed", type=int, default=7)
    replay.add_argument("--dataset-root", type=Path, default=OPENNEURO_REPLAY_ROOT)
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

    physionet_fetch = subparsers.add_parser("fetch-physionet-mi", help="Download one PhysioNet EEGBCI motor-imagery subject.")
    physionet_fetch.add_argument("--subject", default=DEFAULT_PHYSIONET_SUBJECT)
    physionet_fetch.add_argument("--runs", nargs="*", type=int, default=list(DEFAULT_MOTOR_IMAGERY_RUNS))
    physionet_fetch.add_argument("--target-dir", type=Path, default=Path("data/physionet"))

    cohort = subparsers.add_parser("cohort-openneuro", help="Run Experiment 001 across local OpenNeuro subjects.")
    cohort.add_argument("--dataset-root", type=Path, default=OPENNEURO_REPLAY_ROOT)
    cohort.add_argument("--subjects", nargs="*", default=None)
    cohort.add_argument("--session", default=DEFAULT_SESSION)
    cohort.add_argument("--acquisition", default=DEFAULT_ACQUISITION)
    cohort.add_argument("--seconds-per-state", type=float, default=12.0)
    cohort.add_argument("--report-dir", type=Path, default=None)

    motor = subparsers.add_parser("motor-imagery-physionet", help="Run Experiment 002 on a PhysioNet EEGBCI subject.")
    motor.add_argument("--dataset-root", type=Path, default=PHYSIONET_REPLAY_ROOT)
    motor.add_argument("--subject", default=DEFAULT_PHYSIONET_SUBJECT)
    motor.add_argument("--runs", nargs="*", type=int, default=list(DEFAULT_MOTOR_IMAGERY_RUNS))
    motor.add_argument("--report-dir", type=Path, default=None)

    motor_cohort = subparsers.add_parser("motor-imagery-cohort-physionet", help="Run Experiment 002 across PhysioNet EEGBCI subjects.")
    motor_cohort.add_argument("--dataset-root", type=Path, default=PHYSIONET_REPLAY_ROOT)
    motor_cohort.add_argument("--subjects", nargs="*", default=None)
    motor_cohort.add_argument("--runs", nargs="*", type=int, default=list(DEFAULT_MOTOR_IMAGERY_RUNS))
    motor_cohort.add_argument("--report-dir", type=Path, default=None)
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "replay":
        config = ReplayConfig(speed=args.speed)
        experiment_preset = None
        if args.source == "openneuro":
            from neuromirror.openneuro_replay import load_openneuro_replay

            data, times, labels = load_openneuro_replay(
                config,
                dataset_root=args.dataset_root,
                subject=args.subject,
                seconds_per_state=args.seconds / 2,
            )
        elif args.source == "physionet-mi":
            from neuromirror.experiments.motor_imagery import LEFT_RIGHT_MOTOR_IMAGERY
            from neuromirror.physionet_mi import load_physionet_motor_imagery_replay

            config = ReplayConfig(channels=MOTOR_IMAGERY_CHANNELS, sample_rate_hz=160, speed=args.speed)
            experiment_preset = LEFT_RIGHT_MOTOR_IMAGERY
            dataset_root = PHYSIONET_REPLAY_ROOT if args.dataset_root == OPENNEURO_REPLAY_ROOT else args.dataset_root
            data, times, labels = load_physionet_motor_imagery_replay(
                config,
                dataset_root=dataset_root,
                subject=args.subject,
                runs=tuple(DEFAULT_MOTOR_IMAGERY_RUNS),
            )
            max_samples = int(args.seconds * config.sample_rate_hz)
            data = data[:, :max_samples]
            times = times[:max_samples]
            labels = labels[:max_samples]
        else:
            data, times, labels = generate_eyes_open_closed(config, seconds=args.seconds, seed=args.seed)
            data = bandpass(data, sample_rate_hz=config.sample_rate_hz)
        if experiment_preset is None:
            frames = replay_frames(data, times, labels, config)
        else:
            frames = replay_frames(data, times, labels, config, experiment_preset=experiment_preset)
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

    if args.command == "fetch-physionet-mi":
        from neuromirror.physionet_mi import fetch_physionet_motor_imagery

        dataset_root = fetch_physionet_motor_imagery(
            subject=args.subject,
            runs=tuple(args.runs),
            target_dir=args.target_dir,
        )
        print(f"PhysioNet EEGBCI motor-imagery data ready at {dataset_root}")

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

    if args.command == "motor-imagery-physionet":
        from neuromirror.experiments.motor_imagery import LEFT_RIGHT_MOTOR_IMAGERY
        from neuromirror.physionet_mi import load_physionet_motor_imagery_replay
        from neuromirror.reporting import write_motor_imagery_report

        config = ReplayConfig(channels=MOTOR_IMAGERY_CHANNELS, sample_rate_hz=160)
        data, times, labels = load_physionet_motor_imagery_replay(
            config,
            dataset_root=args.dataset_root,
            subject=args.subject,
            runs=tuple(args.runs),
        )
        frames = list(replay_frames(data, times, labels, config, experiment_preset=LEFT_RIGHT_MOTOR_IMAGERY))
        analysis = frames[0].get("experiment", {}) if frames else {}
        if args.report_dir is not None and analysis:
            json_path, markdown_path = write_motor_imagery_report(
                dict(analysis),
                args.report_dir,
                "physionet-eegbci",
                args.subject,
            )
            analysis["report_paths"] = {"json": str(json_path), "markdown": str(markdown_path)}
        print(json.dumps(analysis, indent=2))

    if args.command == "motor-imagery-cohort-physionet":
        from neuromirror.motor_cohort import analyze_physionet_motor_imagery_cohort
        from neuromirror.reporting import write_motor_imagery_cohort_report

        summary = analyze_physionet_motor_imagery_cohort(
            dataset_root=args.dataset_root,
            subjects=args.subjects,
            runs=tuple(args.runs),
        )
        if args.report_dir is not None:
            json_path, markdown_path = write_motor_imagery_cohort_report(summary, args.report_dir, "physionet-eegbci")
            summary["report_paths"] = {"json": str(json_path), "markdown": str(markdown_path)}
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
