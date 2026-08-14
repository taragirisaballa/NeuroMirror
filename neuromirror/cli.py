from __future__ import annotations

import argparse

from neuromirror.config import ReplayConfig
from neuromirror.processing.filters import bandpass
from neuromirror.replay import print_replay, replay_frames
from neuromirror.synthetic import generate_eyes_open_closed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Replay EEG-like streams through NeuroMirror.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    replay = subparsers.add_parser("replay", help="Replay an EEG source as newline-delimited JSON.")
    replay.add_argument("--source", choices=["synthetic"], default="synthetic")
    replay.add_argument("--seconds", type=float, default=12.0)
    replay.add_argument("--speed", type=float, default=1.0)
    replay.add_argument("--realtime", action="store_true")
    replay.add_argument("--seed", type=int, default=7)
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "replay":
        config = ReplayConfig(speed=args.speed)
        data, times, labels = generate_eyes_open_closed(config, seconds=args.seconds, seed=args.seed)
        filtered = bandpass(data, sample_rate_hz=config.sample_rate_hz)
        frames = replay_frames(filtered, times, labels, config)
        print_replay(frames, config, realtime=args.realtime)
