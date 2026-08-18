# NeuroMirror Motor Imagery Report

- Dataset: `physionet-eegbci`
- Subject: `sub-001`
- Experiment: `motor-imagery-left-right-v1`
- Primary result: `not consistently present`
- Clean windows: `1493`
- Artifact-flagged windows: `0`
- Minimum suppression threshold: `0.50 dB`

## Interpretation

The expected bilateral contralateral mu suppression pattern was not consistently present (left imagery C4 0.96x, -0.18 dB; right imagery C3 0.53x, -2.76 dB).

## Contralateral Sensorimotor Result

| Task | Expected Channel | Band | Rest Median | Task Median | Task/Rest | dB Change | Rest Windows | Task Windows |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Left fist imagery | C4 | mu/alpha | 83.09 uV^2 | 79.62 uV^2 | 0.96x | -0.18 dB | 181 | 129 |
| Right fist imagery | C3 | mu/alpha | 112.67 uV^2 | 59.69 uV^2 | 0.53x | -2.76 dB | 64 | 8 |
| Left fist imagery | C4 | beta | 114.38 uV^2 | 114.29 uV^2 | 1.00x | -0.00 dB | 181 | 129 |
| Right fist imagery | C3 | beta | 162.98 uV^2 | 125.03 uV^2 | 0.77x | -1.15 dB | 64 | 8 |

## Ipsilateral Check

| Task | Channel | Band | Task/Rest | dB Change |
|---|---|---|---:|---:|
| Left fist imagery | C3 | mu/alpha | 0.66x | -1.78 dB |
| Right fist imagery | C4 | mu/alpha | 0.99x | -0.03 dB |

## Notes

This report summarizes Experiment 002 for one PhysioNet EEGBCI subject. Mu is represented by the existing 8-13 Hz alpha band over C3/C4. A supported result requires both expected contralateral comparisons to clear the dB suppression threshold; weak or one-sided effects are reported without being overclaimed.
