"""Our UUIDv7: format, strict ordering under rapid and concurrent generation."""

import threading
import uuid

from planbox.core.ids import Uuid7Generator, is_valid_id, new_id


def test_ids_are_canonical_version_7() -> None:
    """Lowercase, hyphenated, version 7, RFC variant."""
    value = new_id()

    parsed = uuid.UUID(value)
    assert is_valid_id(value)
    assert parsed.version == 7
    assert parsed.variant == uuid.RFC_4122
    assert str(parsed) == value


def test_timestamp_is_the_millisecond_clock() -> None:
    """The first 48 bits are the Unix time in milliseconds."""
    generator = Uuid7Generator(clock_ms=lambda: 1_790_000_000_123)

    value = generator.new()

    assert int(value.replace("-", "")[:12], 16) == 1_790_000_000_123


def test_strictly_increasing_within_one_millisecond() -> None:
    """Thousands of ids in the same millisecond still sort in creation order."""
    generator = Uuid7Generator(clock_ms=lambda: 1_790_000_000_000)

    ids = [generator.new() for _ in range(10_000)]

    assert ids == sorted(ids)
    assert len(set(ids)) == len(ids)
    assert all(is_valid_id(i) for i in ids)


def test_order_survives_a_clock_going_backwards() -> None:
    """A clock jump back (e.g. NTP correction) never produces a smaller id."""
    times = iter([2_000, 2_000, 1_000, 1_000, 3_000])
    generator = Uuid7Generator(clock_ms=lambda: next(times))

    ids = [generator.new() for _ in range(5)]

    assert ids == sorted(ids)


def test_rapid_real_clock_generation_is_ordered() -> None:
    """The module-level generator, as fast as Python can call it."""
    ids = [new_id() for _ in range(20_000)]

    assert ids == sorted(ids)
    assert len(set(ids)) == len(ids)


def test_concurrent_generation_yields_unique_ids() -> None:
    """Threads share one generator without duplicates or lost order per thread."""
    generator = Uuid7Generator()
    results: list[list[str]] = [[] for _ in range(8)]

    def work(bucket: list[str]) -> None:
        bucket.extend(generator.new() for _ in range(2_000))

    threads = [threading.Thread(target=work, args=(bucket,)) for bucket in results]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    everything = [i for bucket in results for i in bucket]
    assert len(set(everything)) == len(everything)
    assert all(bucket == sorted(bucket) for bucket in results)
