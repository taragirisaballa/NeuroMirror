from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.processing.filters import bandpass

DEFAULT_PHYSIONET_SUBJECT = "001"
DEFAULT_MOTOR_IMAGERY_RUNS = (4, 8, 12)
MOTOR_IMAGERY_CHANNELS = ("C3", "C4", "Cz")


class PhysioNetDependencyError(RuntimeError):
    pass


def prepare_local_tool_dirs(base_dir: Path = Path("data")) -> None:
    mne_home = base_dir / ".mne"
    mpl = base_dir / ".matplotlib"
    mne_home.mkdir(parents=True, exist_ok=True)
    mpl.mkdir(parents=True, exist_ok=True)
    os.environ["MNE_DATA"] = str(mne_home.resolve())
    os.environ["MPLCONFIGDIR"] = str(mpl.resolve())


def fetch_physionet_motor_imagery(
    subject: str = DEFAULT_PHYSIONET_SUBJECT,
    runs: tuple[int, ...] = DEFAULT_MOTOR_IMAGERY_RUNS,
    target_dir: Path = Path("data/physionet"),
) -> Path:
    prepare_local_tool_dirs(target_dir)
    try:
        import mne
    except ImportError as exc:
        raise PhysioNetDependencyError('PhysioNet motor imagery support needs MNE. Install: pip install -e ".[openneuro]"') from exc

    mne.datasets.eegbci.load_data(int(subject), list(runs), path=str(target_dir), update_path=False)
    return target_dir


def load_physionet_motor_imagery_replay(
    config: ReplayConfig,
    dataset_root: Path = Path("data/physionet"),
    subject: str = DEFAULT_PHYSIONET_SUBJECT,
    runs: tuple[int, ...] = DEFAULT_MOTOR_IMAGERY_RUNS,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    prepare_local_tool_dirs(dataset_root)
    try:
        import mne
        from mne.datasets import eegbci
    except ImportError as exc:
        raise PhysioNetDependencyError('PhysioNet motor imagery support needs MNE. Install: pip install -e ".[openneuro]"') from exc

    paths = eegbci.load_data(int(subject), list(runs), path=str(dataset_root), update_path=False)
    chunks: list[np.ndarray] = []
    labels: list[str] = []

    for path in paths:
        raw = mne.io.read_raw_edf(path, preload=True, verbose="ERROR")
        eegbci.standardize(raw)
        available = tuple(channel for channel in config.channels if channel in raw.ch_names)
        if available != config.channels:
            found = ", ".join(available)
            expected = ", ".join(config.channels)
            raise ValueError(f"PhysioNet EEGBCI channels do not match replay config. Expected {expected}; found {found}.")
        raw.pick(list(config.channels))
        raw.filter(1.0, 45.0, verbose="ERROR")
        raw.resample(config.sample_rate_hz, verbose="ERROR")
        chunks.append(raw.get_data())
        labels.extend(annotation_labels(raw))

    data = np.concatenate(chunks, axis=1)
    filtered = bandpass(data, sample_rate_hz=config.sample_rate_hz)
    times = np.arange(filtered.shape[1]) / config.sample_rate_hz
    return filtered, times, labels


def annotation_labels(raw: object) -> list[str]:
    labels = ["rest"] * int(raw.n_times)
    for annotation in raw.annotations:
        label = annotation_label(str(annotation["description"]))
        if label is None:
            continue
        start = int(raw.time_as_index(float(annotation["onset"]))[0])
        stop = int(raw.time_as_index(float(annotation["onset"]) + float(annotation["duration"]))[0])
        for index in range(max(0, start), min(stop, len(labels))):
            labels[index] = label
    return labels


def annotation_label(description: str) -> str | None:
    return {
        "T0": "rest",
        "T1": "left_fist_imagery",
        "T2": "right_fist_imagery",
    }.get(description)
