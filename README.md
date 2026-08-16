# NeuroMirror

**A Raspberry Pi-powered EEG observatory for replaying, analyzing, and visualizing real brainwave data.**

NeuroMirror starts with open EEG recordings and treats them like a live stream: replaying the signal, extracting interpretable rhythms, flagging artifacts, and turning the activity into a visual "brain weather" feed.

The goal is not mind reading or medical diagnosis. The goal is an honest neurotech project that shows the signal, the noise, the assumptions, and the beauty of brain activity in motion.

## First Milestone

Replay one eyes-open / eyes-closed EEG session and show how alpha activity changes over time.

```text
OpenNeuro EEG recording
        -> replay stream
        -> signal processing
        -> bandpower + artifact features
        -> dashboard / visualization
```

The dashboard is designed around real OpenNeuro EEG replay. The repo also keeps a synthetic replay command for development and testing.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m neuromirror.cli replay --source synthetic --seconds 12
```

You should see newline-delimited JSON frames with timestamped EEG features.

To launch the first visual dashboard:

```bash
pip install -e ".[openneuro,dev]"
python -m neuromirror.cli fetch-openneuro --dataset ds005385 --subject 001
python -m neuromirror.cli dashboard
```

Then open `http://127.0.0.1:8765`.

## Real EEG Replay

NeuroMirror's dashboard replays real EEG from `ds005385` once one subject has been fetched:

```bash
pip install -e ".[openneuro,dev]"
python -m neuromirror.cli fetch-openneuro --dataset ds005385 --subject 001
python -m neuromirror.cli dashboard
```

## What It Tracks

- Delta, theta, alpha, beta, and gamma integrated bandpower in uV^2
- Alpha reactivity during eyes-open / eyes-closed replay
- Recording-level robust log-power normalization, so windows are scaled against the session instead of against themselves
- Simple channel quality and measurement confidence signals
- Blink-like artifact flags
- Peak non-delta rhythm, signal amplitude, spectral spread, and artifact intensity
- Hemispheric alpha balance and O1/O2 posterior alpha asymmetry
- Sagittal EEG spectral projection for selected frontal, central, and occipital scalp channels
- 10-20 montage-derived inset coordinates for Fp1/Fp2, C3/C4, and O1/O2
- Region summaries for future visual mapping

NeuroMirror does not claim EEG source localization or cortical activation mapping. The visualizer shows a history of changing spectral power from scalp electrodes. Bright points are electrode-derived observations; softer traces between them are interpolation for readability, not evidence that a rhythm physically traveled through tissue.

## Project Shape

```text
neuromirror/
  cli.py                 command-line entrypoint
  config.py              experiment and stream settings
  replay.py              live-like replay loop
  server.py              local dashboard server
  synthetic.py           synthetic EEG generator for demos/tests
  experiments/
    base.py              experiment preset interface
    resting_state.py     Experiment 001: eyes-open / eyes-closed posterior alpha
  processing/
    bandpower.py         frequency-band feature extraction
    artifacts.py         simple artifact heuristics
    filters.py           filtering helpers
docs/
  project-vision.md      build narrative and demo direction
  openneuro-plan.md      public EEG dataset plan
experiments/
  eyes-open-closed.yaml  first replay experiment
tests/
  test_pipeline.py
web/
  index.html             browser dashboard shell
  app.js                 animated EEG visualizer
  styles.css             visual system
```

## Roadmap

1. Synthetic replay with bandpower features
2. OpenNeuro loader for one BIDS EEG dataset
3. Browser dashboard with raw traces and alpha activity
4. Raspberry Pi Zero 2 W deployment notes
5. Live EEG adapter when hardware is available
