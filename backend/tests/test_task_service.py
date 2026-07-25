"""Pure unit tests for app.services.task's private canonicalization
helper — no DB, no HTTP client.

_as_utc_instant is subtle enough (SQLite's DateTime(timezone=True) not
reifying timezone on read) to warrant direct testing rather than only
being exercised indirectly through the API test suite.
"""
from datetime import UTC, datetime, timedelta, timezone

from app.services.task import _as_utc_instant


def test_as_utc_instant_treats_naive_as_utc():
    naive = datetime(2026, 8, 1, 12, 0)
    aware = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    assert _as_utc_instant(naive) == _as_utc_instant(aware)


def test_as_utc_instant_normalizes_other_offsets():
    plus_six = timezone(timedelta(hours=6))
    local = datetime(2026, 8, 1, 18, 0, tzinfo=plus_six)  # == 12:00 UTC
    aware_utc = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    assert _as_utc_instant(local) == _as_utc_instant(aware_utc)


def test_as_utc_instant_distinguishes_different_instants():
    a = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    b = datetime(2026, 8, 1, 12, 1, tzinfo=UTC)
    assert _as_utc_instant(a) != _as_utc_instant(b)
