# NeuroMirror Motor Imagery Cohort Report

- Dataset: `physionet-eegbci`
- Experiment: `motor-imagery-left-right-v1`
- Subjects analyzed: `5`
- Bilateral pattern present: `1/5`
- Partial pattern: `2/5`
- Not consistently present: `1/5`
- Insufficient clean windows: `1/5`
- Skipped subjects: `0`

## Group Result

- Median left-imagery C4 mu change: `-0.21 dB`
- Left-imagery C4 mu dB IQR: `-0.33 dB to -0.17 dB`
- Median right-imagery C3 mu change: `-0.76 dB`
- Right-imagery C3 mu dB IQR: `-1.29 dB to -0.47 dB`

## Interpretation

Across 5 subjects, 1 showed the full bilateral contralateral pattern and 2 showed a one-sided pattern. Median mu changes were -0.21 dB for left-imagery C4 and -0.76 dB for right-imagery C3.

## Subject Results

| Subject | Support | Left C4 Mu | Right C3 Mu | Left C4 Beta | Right C3 Beta | Rest | Left | Right | Artifact-Flagged |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `sub-001` | right only | -0.18 dB | -2.76 dB | -0.00 dB | -1.15 dB | 181 | 129 | 8 | 0 |
| `sub-002` | right only | -0.25 dB | -0.80 dB | -0.28 dB | -0.15 dB | 731 | 377 | 335 | 0 |
| `sub-003` | insufficient data | +1.25 dB | +4.31 dB | -0.22 dB | +3.87 dB | 3 | 5 | 3 | 0 |
| `sub-004` | bilateral | -0.55 dB | -0.71 dB | -0.48 dB | -0.82 dB | 590 | 370 | 354 | 0 |
| `sub-005` | not consistent | -0.16 dB | +0.26 dB | -0.60 dB | -0.56 dB | 715 | 344 | 356 | 0 |

## Notes

This report summarizes Experiment 002 across PhysioNet EEGBCI subjects. The primary outcome is contralateral mu/alpha suppression: left imagery should reduce C4 mu, and right imagery should reduce C3 mu. Partial and absent patterns are kept visible rather than discarded, because subject-to-subject variability is part of the evidence. Subjects with insufficient clean rest/task windows are shown in the table but excluded from group medians.
