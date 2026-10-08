/**
 * Fractional index keys: line-for-line twin of backend/planbox/core/ordering.py
 * (rocicorp/fractional-indexing, CC0). Both are checked against
 * shared/ordering-vectors.json, so optimistic positions equal the server's.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = "0";
const SMALLEST_INTEGER = "A" + ZERO.repeat(26);

/** Returns a key strictly between `a` and `b` (null = open end). */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validateKey(a);
  if (b !== null) validateKey(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return "a" + ZERO;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint("", fb);
    if (ib < b) return ib;
    const decremented = decrementInteger(ib);
    if (decremented === null) throw new Error("cannot decrement any further");
    return decremented;
  }

  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const incremented = incrementInteger(ia);
    return incremented ?? ia + midpoint(fa, null);
  }

  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const incremented = incrementInteger(ia);
  if (incremented === null) throw new Error("cannot increment any further");
  if (incremented < b) return incremented;
  return ia + midpoint(fa, null);
}

function digitAt(text: string, index: number): string {
  return text.charAt(index);
}

/** Keys are ASCII-only, so code units are characters. */
function chars(text: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += 1) result.push(text.charAt(i));
  return result;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.endsWith(ZERO) || (b?.endsWith(ZERO) ?? false)) throw new Error("trailing zero");
  if (b !== null) {
    let n = 0;
    while (n < b.length && (n < a.length ? digitAt(a, n) : ZERO) === digitAt(b, n)) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(digitAt(a, 0)) : 0;
  const digitB = b !== null ? DIGITS.indexOf(digitAt(b, 0)) : DIGITS.length;
  if (digitB - digitA > 1) return digitAt(DIGITS, Math.floor((digitA + digitB + 1) / 2));
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return digitAt(DIGITS, digitA) + midpoint(a.slice(1), null);
}

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid key head ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(digitAt(key, 0));
  if (length > key.length) throw new Error(`invalid key ${key}`);
  return key.slice(0, length);
}

function validateKey(key: string): void {
  if (key === "" || key === SMALLEST_INTEGER || chars(key).some((c) => !DIGITS.includes(c))) {
    throw new Error(`invalid key ${key}`);
  }
  if (key.slice(integerPart(key).length).endsWith(ZERO)) throw new Error(`invalid key ${key}`);
}

function incrementInteger(x: string): string | null {
  const head = digitAt(x, 0);
  const digits = chars(x.slice(1));
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i -= 1) {
    const d = DIGITS.indexOf(digits[i] ?? ZERO) + 1;
    if (d === DIGITS.length) {
      digits[i] = ZERO;
    } else {
      digits[i] = digitAt(DIGITS, d);
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return "a" + ZERO;
  if (head === "z") return null;
  const newHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (newHead > "a") digits.push(ZERO);
  else digits.pop();
  return newHead + digits.join("");
}

function decrementInteger(x: string): string | null {
  const head = digitAt(x, 0);
  const digits = chars(x.slice(1));
  const last = digitAt(DIGITS, DIGITS.length - 1);
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i -= 1) {
    const d = DIGITS.indexOf(digits[i] ?? ZERO) - 1;
    if (d === -1) {
      digits[i] = last;
    } else {
      digits[i] = digitAt(DIGITS, d);
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join("");
  if (head === "a") return "Z" + last;
  if (head === "A") return null;
  const newHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (newHead < "Z") digits.push(last);
  else digits.pop();
  return newHead + digits.join("");
}

/** An item with an id and a position, e.g. a todo or a list. */
export interface Positioned {
  id: string;
  position: string;
}

/** Sorts by position, then id (the server's ORDER BY). */
export function byPosition<T extends Positioned>(a: T, b: T): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Mirrors the server's `place()`: the key for an item placed among
 * `siblings` (sorted, excluding the item) next to the given neighbours.
 */
export function placeAmong(
  siblings: readonly Positioned[],
  beforeId: string | null,
  afterId: string | null,
): string {
  const index = new Map(siblings.map((s, i) => [s.id, i]));
  let a: string | null;
  let b: string | null;
  if (afterId !== null && index.has(afterId)) {
    const i = index.get(afterId) ?? 0;
    a = siblings[i]?.position ?? null;
    b =
      beforeId !== null && index.has(beforeId)
        ? (siblings[index.get(beforeId) ?? 0]?.position ?? null)
        : (siblings[i + 1]?.position ?? null);
  } else if (beforeId !== null && index.has(beforeId)) {
    const i = index.get(beforeId) ?? 0;
    b = siblings[i]?.position ?? null;
    a = i > 0 ? (siblings[i - 1]?.position ?? null) : null;
  } else {
    a = siblings.at(-1)?.position ?? null;
    b = null;
  }
  return keyBetween(a, b);
}
