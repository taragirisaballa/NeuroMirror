# Project Vision

NeuroMirror is a real-time brainwave observatory. It starts by replaying open EEG recordings as if they were streaming from a headset, then grows toward live Raspberry Pi acquisition when hardware is available.

## Platform Direction

NeuroMirror is not intended to remain an eyes-open / eyes-closed OpenNeuro visualization. The current resting-state alpha replay is Experiment 001 on top of a general EEG exploration platform.

The core platform should stay dataset-agnostic:

```text
EEG recording
  -> metadata
  -> preprocessing
  -> windows / epochs
  -> spectra and features
  -> synchronized visualization payloads
```

Experiment presets define what the data mean. The resting-state preset can ask whether posterior alpha changes during eyes closed. A future motor-imagery preset might ask about C3/C4 mu or beta modulation. A P300 preset might compute ERP amplitude and latency instead of posterior alpha. The core engine should not bake in `eyes_open`, `eyes_closed`, six fixed channels, one OpenNeuro dataset, or Raspberry Pi assumptions.

The key invariant is:

```text
same raw EEG + same window + same timestamp
  -> mutually consistent raw trace, PSD, bandpower, spectrogram,
     evidence statistics, scalp projection, and centerpiece
```

## Demo Story

The first public demo should be simple and real:

> Watch alpha activity change when a participant moves from eyes-open rest to eyes-closed rest.

The dashboard should make the raw signal visible, show the extracted rhythm features, and clearly label artifact or quality warnings. The best version feels beautiful without pretending EEG is magic.

## Design Principles

- Show raw signal receipts.
- Separate signal from interpretation.
- Prefer real neuroscience effects over vague mental-state claims.
- Make uncertainty visible.
- Keep the Raspberry Pi as the edge-computing anchor.

## First Public Post Angle

I am building NeuroMirror: a Raspberry Pi-powered brainwave observatory that turns real open EEG recordings into a live, interactive visualization.

The goal is not mind reading. It is an honest look at brain signals: the rhythms, the artifacts, the assumptions, and the strange elegance of neural activity in motion.
