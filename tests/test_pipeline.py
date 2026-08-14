from neuromirror.config import ReplayConfig
from neuromirror.openneuro_replay import recording_paths
from neuromirror.processing.filters import bandpass
from neuromirror.replay import replay_frames
from neuromirror.synthetic import generate_eyes_open_closed


def test_synthetic_replay_emits_alpha_summary() -> None:
    config = ReplayConfig()
    data, times, labels = generate_eyes_open_closed(config, seconds=6)
    filtered = bandpass(data, config.sample_rate_hz)
    frames = list(replay_frames(filtered, times, labels, config))

    assert frames
    assert "posterior_alpha_ratio" in frames[0]["summary"]
    assert "dominant_rhythm" in frames[0]["summary"]
    assert "signal_amplitude_uv" in frames[0]["summary"]
    assert "artifact_intensity" in frames[0]["summary"]
    assert "hemispheric_balance" in frames[0]["summary"]
    assert "posterior_alpha_asymmetry" in frames[0]["summary"]
    assert "spectral_spread" in frames[0]["summary"]
    assert "measurement_confidence" in frames[0]["summary"]
    assert "normalized_features" in frames[0]
    assert "normalized_bands" in frames[0]
    assert frames[0]["scaling"]["display_band_power_unit"] == "uV^2"
    assert frames[0]["frame_id"] == 0
    assert frames[1]["frame_id"] == 1
    assert frames[0]["experiment"]["name"] == "Eyes Open vs Eyes Closed"
    assert frames[0]["experiment"]["total_windows"] == len(frames)
    assert (
        frames[0]["experiment"]["clean_windows"] + frames[0]["experiment"]["excluded_windows"]
        == len(frames)
    )
    assert "posterior_alpha" in frames[0]["experiment"]["comparisons"]
    posterior_alpha = frames[0]["experiment"]["comparisons"]["posterior_alpha"]
    assert "eyes_open_median_uv2" in posterior_alpha
    assert "eyes_closed_median_uv2" in posterior_alpha
    assert "ratio_closed_open" in posterior_alpha
    assert "db_change" in posterior_alpha
    assert "primary_result" in frames[0]["experiment"]
    assert "O1" in frames[0]["raw_preview"]
    assert frames[0]["state"] == "eyes_open"
    assert frames[-1]["state"] == "eyes_closed"


def test_openneuro_recording_paths_include_minimal_real_eeg_files() -> None:
    paths = recording_paths(subject="001")

    assert "sub-001/ses-1/eeg/sub-001_ses-1_task-EyesOpen_acq-pre_eeg.edf" in paths
    assert "sub-001/ses-1/eeg/sub-001_ses-1_task-EyesClosed_acq-pre_eeg.edf" in paths
    assert "dataset_description.json" in paths
