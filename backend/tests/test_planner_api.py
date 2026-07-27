import uuid
from datetime import UTC, datetime, timedelta

from .conftest import auth_headers, make_token

CALENDAR_URL = "/api/v1/planner/calendar"
DAY_URL = "/api/v1/planner/day"


def _assert_aware_utc_instant(iso_str: str, expected: datetime) -> None:
    """Proves a planner response datetime is genuinely timezone-aware
    (carries an explicit UTC offset, even over the SQLite test path where
    the ORM round-trip itself comes back naive) and represents the
    correct instant — a naive datetime here could be misread as local
    time by a mobile client."""
    parsed = datetime.fromisoformat(iso_str)
    assert parsed.tzinfo is not None, f"{iso_str!r} is not timezone-aware"
    assert parsed.utcoffset() is not None
    assert parsed.astimezone(UTC) == expected


def _create_task(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {
        "title": "Read Chapter 3",
        "type": "Assignment",
        "deadline": datetime(2026, 6, 15, 12, 0, tzinfo=UTC).isoformat(),
        "priority": "Medium",
    }
    payload.update(overrides)
    return client.post("/api/v1/tasks", json=payload, headers=headers).json()["id"]


def _create_block(client, headers=None, **overrides):
    headers = headers or auth_headers()
    payload = {
        "starts_at": datetime(2026, 6, 15, 9, 0, tzinfo=UTC).isoformat(),
        "ends_at": datetime(2026, 6, 15, 10, 0, tzinfo=UTC).isoformat(),
    }
    payload.update(overrides)
    return client.post("/api/v1/study-blocks", json=payload, headers=headers).json()["id"]


def _set_timezone(client, headers, tz_name):
    response = client.patch("/api/v1/profile", json={"timezone": tz_name}, headers=headers)
    assert response.status_code == 200


def _intruder_headers():
    return {"Authorization": f"Bearer {make_token(uuid.uuid4(), 'intruder@example.com')}"}


# --- authentication ---


def test_get_calendar_requires_auth(client):
    response = client.get(
        CALENDAR_URL, params={"start_date": "2026-06-01", "end_date": "2026-06-30"}
    )
    assert response.status_code == 401


def test_get_day_requires_auth(client):
    response = client.get(DAY_URL, params={"date": "2026-06-15"})
    assert response.status_code == 401


# --- calendar: query validation ---


def test_calendar_rejects_end_date_before_start_date(client):
    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-10", "end_date": "2026-06-01"},
        headers=auth_headers(),
    )
    assert response.status_code == 422


def test_calendar_rejects_range_exceeding_cap(client):
    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-01-01", "end_date": "2026-03-04"},  # 63 inclusive days
        headers=auth_headers(),
    )
    assert response.status_code == 422


def test_calendar_accepts_max_cap_range(client):
    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-01-01", "end_date": "2026-03-03"},  # 62 inclusive days
        headers=auth_headers(),
    )
    assert response.status_code == 200


def test_calendar_rejects_unknown_query_param(client):
    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-01", "end_date": "2026-06-30", "bogus": "x"},
        headers=auth_headers(),
    )
    assert response.status_code == 422


def test_calendar_requires_both_dates(client):
    response = client.get(CALENDAR_URL, params={"start_date": "2026-06-01"}, headers=auth_headers())
    assert response.status_code == 422


def test_day_rejects_unknown_query_param(client):
    response = client.get(
        DAY_URL, params={"date": "2026-06-15", "bogus": "x"}, headers=auth_headers()
    )
    assert response.status_code == 422


# --- day: profile-timezone boundaries ---


def test_day_uses_profile_timezone_for_boundaries(client):
    headers = auth_headers()
    _set_timezone(client, headers, "Asia/Kolkata")  # fixed UTC+05:30, no DST

    # 2026-06-15 23:30 IST == 2026-06-15 18:00 UTC -> still local June 15.
    same_day_task = _create_task(
        client,
        headers,
        title="Same local day",
        deadline=datetime(2026, 6, 15, 18, 0, tzinfo=UTC).isoformat(),
    )
    # 2026-06-16 00:30 IST == 2026-06-15 19:00 UTC -> local June 16, not 15.
    _create_task(
        client,
        headers,
        title="Next local day",
        deadline=datetime(2026, 6, 15, 19, 0, tzinfo=UTC).isoformat(),
    )

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.status_code == 200
    task_ids = {t["id"] for t in response.json()["tasks"]}
    assert task_ids == {same_day_task}


# --- overlap boundaries (half-open interval) ---


def test_day_includes_block_starting_before_window_and_ending_inside(client):
    headers = auth_headers()
    _set_timezone(client, headers, "UTC")
    window_start = datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    block_id = _create_block(
        client,
        headers,
        starts_at=(window_start - timedelta(hours=1)).isoformat(),
        ends_at=(window_start + timedelta(hours=1)).isoformat(),
    )

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.status_code == 200
    block_ids = {b["id"] for b in response.json()["study_blocks"]}
    assert block_ids == {block_id}


def test_day_excludes_block_ending_exactly_at_window_start(client):
    headers = auth_headers()
    _set_timezone(client, headers, "UTC")
    window_start = datetime(2026, 6, 15, 0, 0, tzinfo=UTC)
    _create_block(
        client,
        headers,
        starts_at=(window_start - timedelta(hours=2)).isoformat(),
        ends_at=window_start.isoformat(),
    )

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.json()["study_blocks"] == []


def test_day_excludes_block_starting_exactly_at_window_end(client):
    headers = auth_headers()
    _set_timezone(client, headers, "UTC")
    window_end = datetime(2026, 6, 16, 0, 0, tzinfo=UTC)
    _create_block(
        client,
        headers,
        starts_at=window_end.isoformat(),
        ends_at=(window_end + timedelta(hours=1)).isoformat(),
    )

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.json()["study_blocks"] == []


# --- response datetimes are always timezone-aware ---


def test_calendar_response_datetimes_are_timezone_aware(client):
    headers = auth_headers()
    task_deadline = datetime(2026, 6, 15, 12, 0, tzinfo=UTC)
    block_start = datetime(2026, 6, 15, 9, 0, tzinfo=UTC)
    block_end = datetime(2026, 6, 15, 10, 0, tzinfo=UTC)
    _create_task(client, headers, deadline=task_deadline.isoformat())
    _create_block(
        client, headers, starts_at=block_start.isoformat(), ends_at=block_end.isoformat()
    )

    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    _assert_aware_utc_instant(body["tasks"][0]["deadline"], task_deadline)
    _assert_aware_utc_instant(body["study_blocks"][0]["starts_at"], block_start)
    _assert_aware_utc_instant(body["study_blocks"][0]["ends_at"], block_end)


def test_day_response_datetimes_are_timezone_aware(client):
    headers = auth_headers()
    task_deadline = datetime(2026, 6, 15, 12, 0, tzinfo=UTC)
    block_start = datetime(2026, 6, 15, 9, 0, tzinfo=UTC)
    block_end = datetime(2026, 6, 15, 10, 0, tzinfo=UTC)
    _create_task(client, headers, deadline=task_deadline.isoformat())
    _create_block(
        client, headers, starts_at=block_start.isoformat(), ends_at=block_end.isoformat()
    )

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    _assert_aware_utc_instant(body["tasks"][0]["deadline"], task_deadline)
    _assert_aware_utc_instant(body["study_blocks"][0]["starts_at"], block_start)
    _assert_aware_utc_instant(body["study_blocks"][0]["ends_at"], block_end)


# --- deterministic ordering ---


def test_calendar_orders_tasks_by_deadline_then_id(client):
    headers = auth_headers()
    later = _create_task(
        client,
        headers,
        title="Later",
        deadline=datetime(2026, 6, 20, 12, 0, tzinfo=UTC).isoformat(),
    )
    earlier = _create_task(
        client,
        headers,
        title="Earlier",
        deadline=datetime(2026, 6, 10, 12, 0, tzinfo=UTC).isoformat(),
    )

    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        headers=headers,
    )
    ids_in_order = [t["id"] for t in response.json()["tasks"]]
    assert ids_in_order.index(earlier) < ids_in_order.index(later)


def test_calendar_orders_study_blocks_by_starts_at_then_id(client):
    headers = auth_headers()
    later = _create_block(
        client,
        headers,
        starts_at=datetime(2026, 6, 20, 9, 0, tzinfo=UTC).isoformat(),
        ends_at=datetime(2026, 6, 20, 10, 0, tzinfo=UTC).isoformat(),
    )
    earlier = _create_block(
        client,
        headers,
        starts_at=datetime(2026, 6, 10, 9, 0, tzinfo=UTC).isoformat(),
        ends_at=datetime(2026, 6, 10, 10, 0, tzinfo=UTC).isoformat(),
    )

    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        headers=headers,
    )
    ids_in_order = [b["id"] for b in response.json()["study_blocks"]]
    assert ids_in_order.index(earlier) < ids_in_order.index(later)


# --- two-account isolation ---


def test_calendar_only_returns_own_tasks_and_blocks(client):
    owner_headers = auth_headers(email="owner@example.com")
    _create_task(client, owner_headers)
    _create_block(client, owner_headers)

    intruder_headers = _intruder_headers()
    response = client.get(
        CALENDAR_URL,
        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        headers=intruder_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tasks"] == []
    assert body["study_blocks"] == []


# --- archived-subject snapshot ---


def test_day_task_item_includes_archived_subject_snapshot(client):
    headers = auth_headers()
    subject_id = client.post(
        "/api/v1/subjects", json={"name": "Physics", "color_token": "teal"}, headers=headers
    ).json()["id"]
    _create_task(client, headers, subject_id=subject_id)
    client.patch(f"/api/v1/subjects/{subject_id}", json={"archived": True}, headers=headers)

    response = client.get(DAY_URL, params={"date": "2026-06-15"}, headers=headers)
    assert response.status_code == 200
    tasks = response.json()["tasks"]
    assert len(tasks) == 1
    assert tasks[0]["subject"]["id"] == subject_id
    assert tasks[0]["subject"]["archived"] is True
