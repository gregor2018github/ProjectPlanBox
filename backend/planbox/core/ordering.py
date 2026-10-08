"""Fractional index keys for manual ordering.

A key is a base-62 string; string order is the item order. Inserting between
two neighbours creates a key strictly between theirs, so a move updates one
row. Appending stays short because keys carry a variable-length integer part
(the algorithm of rocicorp/fractional-indexing, CC0).

``frontend/src/core/ordering.ts`` is a line-for-line twin. Both are checked
against ``shared/ordering-vectors.json``; change them together.
"""

DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_ZERO = DIGITS[0]
_SMALLEST_INTEGER = "A" + _ZERO * 26


class OrderingError(ValueError):
    """Raised for malformed keys or impossible requests (``a >= b``)."""


def key_between(a: str | None, b: str | None) -> str:  # noqa: PLR0911 - mirrors the reference
    """Returns a key strictly between ``a`` and ``b``.

    Args:
        a: The key before the new one, or ``None`` for "at the start".
        b: The key after the new one, or ``None`` for "at the end".

    Raises:
        OrderingError: If a key is malformed or ``a >= b``.
    """
    if a is not None:
        _validate_key(a)
    if b is not None:
        _validate_key(b)
    if a is not None and b is not None and a >= b:
        raise OrderingError(f"{a} >= {b}")

    if a is None:
        if b is None:
            return "a" + _ZERO
        ib = _integer_part(b)
        fb = b[len(ib) :]
        if ib == _SMALLEST_INTEGER:
            return ib + _midpoint("", fb)
        if ib < b:
            return ib
        decremented = _decrement_integer(ib)
        if decremented is None:
            raise OrderingError("cannot decrement any further")
        return decremented

    if b is None:
        ia = _integer_part(a)
        fa = a[len(ia) :]
        incremented = _increment_integer(ia)
        return ia + _midpoint(fa, None) if incremented is None else incremented

    ia = _integer_part(a)
    fa = a[len(ia) :]
    ib = _integer_part(b)
    fb = b[len(ib) :]
    if ia == ib:
        return ia + _midpoint(fa, fb)
    incremented = _increment_integer(ia)
    if incremented is None:
        raise OrderingError("cannot increment any further")
    if incremented < b:
        return incremented
    return ia + _midpoint(fa, None)


def _midpoint(a: str, b: str | None) -> str:
    """Midpoint of two fractional parts; ``b is None`` means "one past the end"."""
    if b is not None and a >= b:
        raise OrderingError(f"{a} >= {b}")
    if a.endswith(_ZERO) or (b is not None and b.endswith(_ZERO)):
        raise OrderingError("trailing zero")
    if b is not None:
        n = 0
        while n < len(b) and (a[n] if n < len(a) else _ZERO) == b[n]:
            n += 1
        if n > 0:
            return b[:n] + _midpoint(a[n:], b[n:])
    digit_a = DIGITS.index(a[0]) if a else 0
    digit_b = DIGITS.index(b[0]) if b is not None else len(DIGITS)
    if digit_b - digit_a > 1:
        # Round half up, written so JavaScript's Math.round gives the same digit.
        return DIGITS[(digit_a + digit_b + 1) // 2]
    if b is not None and len(b) > 1:
        return b[:1]
    return DIGITS[digit_a] + _midpoint(a[1:], None)


def _integer_length(head: str) -> int:
    if "a" <= head <= "z":
        return ord(head) - ord("a") + 2
    if "A" <= head <= "Z":
        return ord("Z") - ord(head) + 2
    raise OrderingError(f"invalid key head {head!r}")


def _integer_part(key: str) -> str:
    length = _integer_length(key[0])
    if length > len(key):
        raise OrderingError(f"invalid key {key!r}")
    return key[:length]


def _validate_key(key: str) -> None:
    if not key or key == _SMALLEST_INTEGER or any(c not in DIGITS for c in key):
        raise OrderingError(f"invalid key {key!r}")
    integer = _integer_part(key)
    if key[len(integer) :].endswith(_ZERO):
        raise OrderingError(f"invalid key {key!r}")


def _increment_integer(x: str) -> str | None:
    head, digits = x[0], list(x[1:])
    carry = True
    i = len(digits) - 1
    while carry and i >= 0:
        d = DIGITS.index(digits[i]) + 1
        if d == len(DIGITS):
            digits[i] = _ZERO
        else:
            digits[i] = DIGITS[d]
            carry = False
        i -= 1
    if not carry:
        return head + "".join(digits)
    if head == "Z":
        return "a" + _ZERO
    if head == "z":
        return None
    new_head = chr(ord(head) + 1)
    if new_head > "a":
        digits.append(_ZERO)
    else:
        digits.pop()
    return new_head + "".join(digits)


def _decrement_integer(x: str) -> str | None:
    head, digits = x[0], list(x[1:])
    borrow = True
    i = len(digits) - 1
    while borrow and i >= 0:
        d = DIGITS.index(digits[i]) - 1
        if d == -1:
            digits[i] = DIGITS[-1]
        else:
            digits[i] = DIGITS[d]
            borrow = False
        i -= 1
    if not borrow:
        return head + "".join(digits)
    if head == "a":
        return "Z" + DIGITS[-1]
    if head == "A":
        return None
    new_head = chr(ord(head) - 1)
    if new_head < "Z":
        digits.append(DIGITS[-1])
    else:
        digits.pop()
    return new_head + "".join(digits)
