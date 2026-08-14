# OpenNeuro Plan

Version 1 uses synthetic EEG so the pipeline can run anywhere. Version 2 should load a real BIDS EEG dataset from OpenNeuro.

## Target Dataset

Candidate: `ds007615`, a resting-state EEG dataset with eyes-open and eyes-closed conditions.

Current implementation target: `ds005385`, a 64-channel resting-state EEG dataset with `EyesOpen` and `EyesClosed` tasks.

## Planned Loader

The OpenNeuro loader should:

1. Download or locate one subject/session from a BIDS dataset.
2. Load eyes-open and eyes-closed EDF recordings with MNE.
3. Select EEG channels and event annotations.
4. Resample to a Pi-friendly stream rate.
5. Emit the same array/timestamp/label shape used by the synthetic replay.

Keeping this interface stable means the dashboard will not care whether the signal came from synthetic data, OpenNeuro replay, or future live hardware.

## Safety Language

OpenNeuro replay is for educational and creative visualization. It should not be framed as diagnosis, wellness scoring, treatment, or individual mental-state classification.
