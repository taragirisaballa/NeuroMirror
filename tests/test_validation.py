import numpy as np

from neuromirror.config import ReplayConfig
from neuromirror.processing.filters import bandpass
from neuromirror.replay import replay_frames
from neuromirror.synthetic import generate_eyes_open_closed


def _synthetic_frames() -> list[dict[str, object]]:
    config = ReplayConfig()
    data, times, labels = generate_eyes_open_closed(config, seconds=6)
    filtered = bandpass(data, config.sample_rate_hz)
    return list(replay_frames(filtered, times, labels, config))


def test_alpha_bandpower_matches_integrated_psd_for_same_frame() -> None:
    frames = _synthetic_frames()

    for frame in (frames[0], frames[len(frames) // 2], frames[-1]):
        for channel in ("O1", "O2", "C3"):
            spectrum = frame["spectra"][channel]
            frequencies = np.asarray(spectrum["frequencies_hz"], dtype=float)
            power_uv2_per_hz = np.asarray(spectrum["power_uv2_per_hz"], dtype=float)
            alpha_mask = (frequencies >= 8.0) & (frequencies < 13.0)

            integrated_alpha_v2 = np.trapezoid(power_uv2_per_hz[alpha_mask], frequencies[alpha_mask]) / 1e12
            reported_alpha_v2 = frame["features"][channel]["alpha"]

            np.testing.assert_allclose(integrated_alpha_v2, reported_alpha_v2, rtol=1e-4, atol=1e-18)


def test_spectrogram_columns_match_posterior_psd_windows() -> None:
    frames = _synthetic_frames()
    spectrogram = frames[0]["spectrogram"]

    for frame_index in (0, len(frames) // 2, len(frames) - 1):
        o1 = np.asarray(frames[frame_index]["spectra"]["O1"]["power_uv2_per_hz"], dtype=float)
        o2 = np.asarray(frames[frame_index]["spectra"]["O2"]["power_uv2_per_hz"], dtype=float)
        expected_posterior = np.round((o1 + o2) / 2.0, 4)
        spectrogram_column = np.asarray(spectrogram["power_uv2_per_hz"][frame_index], dtype=float)

        np.testing.assert_allclose(spectrogram_column, expected_posterior, rtol=1e-6, atol=1e-4)
        assert spectrogram["times_s"][frame_index] == frames[frame_index]["time_s"]


def test_spectrogram_state_boundary_uses_first_label_transition() -> None:
    frames = _synthetic_frames()
    spectrogram = frames[0]["spectrogram"]
    first_state = frames[0]["state"]
    expected_boundary = next(frame["time_s"] for frame in frames if frame["state"] != first_state)

    assert spectrogram["state_boundary_s"] == expected_boundary
