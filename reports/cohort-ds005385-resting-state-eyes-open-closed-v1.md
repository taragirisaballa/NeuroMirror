# NeuroMirror Cohort Report

- Dataset: `ds005385`
- Experiment: `resting-state-eyes-open-closed-v1`
- Subjects analyzed: `4`
- Subjects supporting posterior alpha increase: `4/4`
- Skipped subjects: `0`

## Group Result

- Median closed/open ratio: `9.39x`
- Ratio IQR: `5.79x to 11.74x`
- Median dB change: `+9.62 dB`
- dB IQR: `+6.59 dB to +10.70 dB`

## Interpretation

Across 4 locally fetched subjects, 4 showed posterior alpha increasing during eyes closed. The group median effect was 9.39x (+9.62 dB). One or more subjects showed a weak effect, highlighting expected between-subject variability.

## Subject Results

| Subject | Supported | Closed/Open | dB Change | Open Windows | Closed Windows | Usable Windows | Artifact-Flagged |
|---|---:|---:|---:|---:|---:|---:|---:|
| `sub-001` | yes | 12.73x | +11.05 dB | 41 | 48 | 89 | 42 |
| `sub-002` | yes | 7.37x | +8.67 dB | 41 | 48 | 89 | 41 |
| `sub-003` | yes | 1.08x | +0.35 dB | 41 | 48 | 89 | 38 |
| `sub-004` | yes | 11.42x | +10.58 dB | 39 | 48 | 87 | 52 |

## Notes

This report summarizes Experiment 001 across locally fetched OpenNeuro subjects. The group result is based on posterior O1/O2 alpha bandpower using the same replay windows, PSD, bandpower, artifact, and experiment-preset pipeline as the live NeuroMirror dashboard.
Weak positive responders: `sub-003`. These subjects increase the scientific value of the cohort by exposing subject-to-subject variability.
