from neuromirror.config import ReplayConfig
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
    assert "O1" in frames[0]["raw_preview"]
    assert frames[0]["state"] == "eyes_open"
    assert frames[-1]["state"] == "eyes_closed"
