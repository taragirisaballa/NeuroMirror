from pathlib import Path


def test_browser_unit_labels_are_ascii_unambiguous() -> None:
    for path in (Path("web/index.html"), Path("web/app.js")):
        text = path.read_text()
        assert "µ" not in text
        assert "MV" not in text
        assert "mV" not in text
        assert "uV" in text

