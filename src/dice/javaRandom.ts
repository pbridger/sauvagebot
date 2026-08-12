/**
 * A faithful reimplementation of `java.util.Random`.
 *
 * The Java class is specified exactly (a 48-bit linear congruential generator with a defined
 * scrambling constant and a defined `nextInt(bound)` algorithm), which is what makes the
 * TypeScript port of the dice engine verifiable: seeded with the same value, this produces
 * bit-identical sequences to the JVM, so the conformance corpus generated from the Java engine
 * can be replayed here and compared byte for byte.
 *
 * Arithmetic is done in BigInt because the state is 48 bits and the multiply overflows Number's
 * safe integer range.
 */

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

/** Reinterpret the low 32 bits of a BigInt as a signed 32-bit int. */
function toInt32(value: bigint): number {
  const low = BigInt.asIntN(32, value);
  return Number(low);
}

export class JavaRandom {
  private seed: bigint;

  constructor(seed: number | bigint = Date.now()) {
    this.seed = (BigInt(seed) ^ MULTIPLIER) & MASK;
  }

  /** `protected int next(int bits)` */
  private next(bits: number): number {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    // Java: (int)(seed >>> (48 - bits))
    return toInt32(this.seed >> BigInt(48 - bits));
  }

  /** `public int nextInt()` */
  nextInt32(): number {
    return this.next(32);
  }

  /**
   * `public int nextInt(int bound)` — including the power-of-two fast path and the
   * rejection loop that keeps the distribution uniform for other bounds.
   */
  nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error(`bound must be positive: ${bound}`);
    }

    // Power of two: take the high bits.
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }

    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
      // Java's overflow check: bits - val + (bound - 1) < 0 in 32-bit signed arithmetic.
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }

  /** `public long nextLong()` */
  nextLong(): bigint {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32));
    return BigInt.asIntN(64, (hi << 32n) + lo);
  }

  /** `public double nextDouble()` */
  nextDouble(): number {
    const hi = BigInt(this.next(26));
    const lo = BigInt(this.next(27));
    return Number((hi << 27n) + lo) / Number(1n << 53n);
  }

  /** `public boolean nextBoolean()` */
  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }
}
