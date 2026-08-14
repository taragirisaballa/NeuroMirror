from __future__ import annotations

import subprocess
import sys
import os
from pathlib import Path

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.processing.filters import bandpass

DEFAULT_DATASET = "ds005385"
DEFAULT_SUBJECT = "001"
DEFAULT_SESSION = "1"
DEFAULT_ACQUISITION = "pre"


class OpenNeuroDependencyError(RuntimeError):
    pass


def default_openneuro_root() -> Path:
    return Path("data") / "openneuro"


def prepare_local_tool_dirs(base_dir: Path = Path("data")) -> None:
    home = base_dir / ".openneuro-home"
    mpl = base_dir / ".matplotlib"
    home.mkdir(parents=True, exist_ok=True)
    mpl.mkdir(parents=True, exist_ok=True)
    os.environ["HOME"] = str(home.resolve())
    os.environ.setdefault("MPLCONFIGDIR", str(mpl.resolve()))


def recording_paths(
    dataset: str = DEFAULT_DATASET,
    subject: str = DEFAULT_SUBJECT,
    session: str = DEFAULT_SESSION,
    acquisition: str = DEFAULT_ACQUISITION,
) -> list[str]:
    base = f"sub-{subject}/ses-{session}/eeg/sub-{subject}_ses-{session}"
    paths: list[str] = []
    for task in ("EyesOpen", "EyesClosed"):
        stem = f"{base}_task-{task}_acq-{acquisition}"
        paths.extend(
            [
                f"{stem}_eeg.edf",
                f"{stem}_eeg.json",
                f"{stem}_channels.tsv",
                f"{stem}_events.tsv",
                f"{stem}_events.json",
            ]
        )
    paths.extend(
        [
            "README.md",
            "dataset_description.json",
            "participants.tsv",
            f"sub-{subject}/sub-{subject}_sessions.tsv",
        ]
    )
    return paths


def fetch_openneuro_subset(
    dataset: str = DEFAULT_DATASET,
    subject: str = DEFAULT_SUBJECT,
    session: str = DEFAULT_SESSION,
    acquisition: str = DEFAULT_ACQUISITION,
    target_dir: Path | None = None,
) -> Path:
    target = target_dir or default_openneuro_root()
    target.mkdir(parents=True, exist_ok=True)
    prepare_local_tool_dirs(target)
    paths = recording_paths(dataset, subject, session, acquisition)

    try:
        import openneuro as on
    except ImportError as exc:
        raise OpenNeuroDependencyError(
            'OpenNeuro support is optional. Install it with: pip install -e ".[openneuro]"'
        ) from exc

    try:
        on.download(dataset=dataset, target_dir=str(target / dataset), include=paths)
    except TypeError:
        command = [
            sys.executable,
            "-m",
            "openneuro",
            "download",
            f"--dataset={dataset}",
            f"--target_dir={target / dataset}",
        ]
        for path in paths:
            command.extend(["--include", path])
        subprocess.run(command, check=True, env=os.environ.copy())

    return target / dataset


def load_openneuro_replay(
    config: ReplayConfig,
    dataset_root: Path,
    subject: str = DEFAULT_SUBJECT,
    session: str = DEFAULT_SESSION,
    acquisition: str = DEFAULT_ACQUISITION,
    seconds_per_state: float = 45.0,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    try:
        prepare_local_tool_dirs(dataset_root.parent)
        import mne
    except ImportError as exc:
        raise OpenNeuroDependencyError(
            'Real EEG replay needs MNE. Install it with: pip install -e ".[openneuro]"'
        ) from exc

    chunks: list[np.ndarray] = []
    labels: list[str] = []
    selected_channels: tuple[str, ...] | None = None

    for task, label in (("EyesOpen", "eyes_open"), ("EyesClosed", "eyes_closed")):
        edf_path = (
            dataset_root
            / f"sub-{subject}"
            / f"ses-{session}"
            / "eeg"
            / f"sub-{subject}_ses-{session}_task-{task}_acq-{acquisition}_eeg.edf"
        )
        if not edf_path.exists():
            raise FileNotFoundError(
                f"Missing {edf_path}. Run: python -m neuromirror.cli fetch-openneuro --dataset {DEFAULT_DATASET} --subject {subject}"
            )

        raw = mne.io.read_raw_edf(edf_path, preload=True, verbose="ERROR")
        available = tuple(channel for channel in config.channels if channel in raw.ch_names)
        if not available:
            raise ValueError(f"None of the configured channels were found in {edf_path}.")
        if selected_channels is None:
            selected_channels = available

        raw.pick(list(selected_channels))
        raw.filter(1.0, 45.0, verbose="ERROR")
        raw.resample(config.sample_rate_hz, verbose="ERROR")
        max_samples = int(seconds_per_state * config.sample_rate_hz)
        data = raw.get_data()[:, :max_samples]
        chunks.append(data)
        labels.extend([label] * data.shape[1])

    if selected_channels != config.channels:
        config_channels = ", ".join(selected_channels or ())
        raise ValueError(f"OpenNeuro channels do not match replay config after loading: {config_channels}")

    combined = np.concatenate(chunks, axis=1)
    filtered = bandpass(combined, sample_rate_hz=config.sample_rate_hz)
    times = np.arange(filtered.shape[1]) / config.sample_rate_hz
    return filtered, times, labels
