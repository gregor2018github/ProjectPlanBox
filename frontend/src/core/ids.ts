/**
 * UUIDv7 generation (RFC 9562), matching the backend's `uuid.uuid7()`.
 *
 * The client generates ids for creates so optimistic rows are the real rows.
 * Ids are monotonic within one page: the 12-bit `rand_a` field acts as a
 * counter inside the same millisecond.
 */

let lastMs = -1;
let counter = 0;

/** Returns a new time-ordered UUIDv7 in canonical lowercase form. */
export function newId(now: () => number = Date.now): string {
  let ms = now();
  if (ms <= lastMs) {
    ms = lastMs;
    counter += 1;
    if (counter > 0xfff) {
      ms += 1;
      counter = 0;
    }
  } else {
    counter = randomInt(0x7ff);
  }
  lastMs = ms;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes.subarray(8));
  // 48-bit big-endian millisecond timestamp.
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Tells whether a string is a canonical UUIDv7. */
export function isValidId(value: string): boolean {
  return UUID7.test(value);
}

function randomInt(max: number): number {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % (max + 1);
}
