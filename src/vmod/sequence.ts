/**
 * Faithful port of VASSAL's `VASSAL.tools.SequenceEncoder` and its `Decoder`.
 *
 * VASSAL serializes every piece's type and state as nested delimited strings.
 * Getting the escaping byte-exact is the foundation of the whole interpreter,
 * so this mirrors the Java implementation (including its quirks) rather than
 * inventing a cleaner scheme.
 *
 * Escaping rules (from the Java source):
 *  - Elements are joined by `delim`.
 *  - A literal `delim` inside an element is written as `\` + delim.
 *  - An element starting with `\`, or both starting AND ending with `'`, is
 *    wrapped in single quotes (exact Java condition — a bare leading `'` is
 *    NOT quoted).
 *  - On decode, a `delim` preceded by `\` is treated as literal; surrounding
 *    single quotes are stripped (`unquote`).
 *  - Known Java quirk we reproduce: an element ending in a bare `\` merges
 *    with the following element on decode (the encoder does not protect it).
 */

export class SequenceDecoder {
  private val: string | null;
  private readonly delim: string;
  private start = 0;
  private readonly stop: number;

  constructor(value: string | null, delimiter: string) {
    this.val = value;
    this.delim = delimiter;
    this.stop = value != null ? value.length : 0;
  }

  hasMoreTokens(): boolean {
    return this.val != null;
  }

  /** Remaining raw (still-escaped) content after the current position. */
  getRemaining(): string {
    if (!this.hasMoreTokens()) return "";
    return (this.val as string).substring(this.start, this.stop);
  }

  nextToken(): string {
    if (!this.hasMoreTokens()) {
      throw new Error("SequenceDecoder: no more tokens");
    }
    const val = this.val as string;

    if (this.start === this.stop) {
      // token for "null"/trailing-delimiter is the empty string
      this.val = null;
      return "";
    }

    let buf = "";
    let usedBuf = false;
    let tok: string | null = null;
    let i = this.start;
    for (; i < this.stop; ++i) {
      if (val.charAt(i) === this.delim) {
        if (i > 0 && val.charAt(i - 1) === "\\") {
          // escaped delimiter; drop the backslash, keep delim as literal
          buf += val.substring(this.start, i - 1);
          usedBuf = true;
          this.start = i;
        } else {
          // real delimiter
          if (!usedBuf) {
            tok = val.substring(this.start, i);
          } else {
            buf += val.substring(this.start, i);
          }
          this.start = i + 1;
          break;
        }
      }
    }

    if (this.start < i) {
      // reached the end without a (real) delimiter
      if (!usedBuf) {
        tok = val.substring(this.start);
      } else {
        buf += val.substring(this.start, this.stop);
      }
      this.val = null;
    }

    return SequenceDecoder.unquote(tok !== null ? tok : buf);
  }

  /** Next token as int, with a default when absent/blank (matches VASSAL usage). */
  nextInt(defaultValue: number): number {
    if (!this.hasMoreTokens()) return defaultValue;
    const s = this.nextToken();
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? defaultValue : n;
  }

  nextDouble(defaultValue: number): number {
    if (!this.hasMoreTokens()) return defaultValue;
    const s = this.nextToken();
    const n = parseFloat(s);
    return Number.isNaN(n) ? defaultValue : n;
  }

  nextBoolean(defaultValue: boolean): boolean {
    if (!this.hasMoreTokens()) return defaultValue;
    return this.nextToken() === "true";
  }

  /** Next token as a nested decoder over the same delimiter (common pattern). */
  nextSequence(): SequenceDecoder {
    return new SequenceDecoder(this.nextToken(), this.delim);
  }

  /** Next token with a fallback when absent (VASSAL's `nextToken(String)`). */
  nextTokenOr(defaultValue: string): string {
    return this.hasMoreTokens() ? this.nextToken() : defaultValue;
  }

  /** First char of next token, or default (VASSAL's `nextChar`). */
  nextChar(defaultValue: string): string {
    if (!this.hasMoreTokens()) return defaultValue;
    const s = this.nextToken();
    return s.length > 0 ? s.charAt(0) : defaultValue;
  }

  /**
   * VASSAL's `nextStringArray`: the next token is itself a comma-encoded
   * sub-sequence. Returns at least `minLength` elements (padded with "").
   */
  nextStringArray(minLength: number): string[] {
    let out: string[] = [];
    if (this.hasMoreTokens()) {
      const inner = new SequenceDecoder(this.nextToken(), ",");
      while (inner.hasMoreTokens()) out.push(inner.nextToken());
    }
    while (out.length < minLength) out.push("");
    return out;
  }

  private static unquote(cs: string): string {
    const len = cs.length;
    if (len > 1 && cs.charAt(0) === "'" && cs.charAt(len - 1) === "'") {
      return cs.substring(1, len - 1);
    }
    return cs;
  }
}

export class SequenceEncoder {
  private buffer = "";
  private readonly delim: string;
  private empty = true;

  constructor(delimiter: string, initial?: string) {
    this.delim = delimiter;
    if (initial !== undefined) this.append(initial);
  }

  append(s: string | number | boolean): SequenceEncoder {
    const str = typeof s === "string" ? s : String(s);
    if (!this.empty) this.buffer += this.delim;
    this.empty = false;
    if (str.length > 0 && (str.charAt(0) === "\\" || (str.charAt(0) === "'" && str.charAt(str.length - 1) === "'"))) {
      this.buffer += "'" + this.escape(str) + "'";
    } else {
      this.buffer += this.escape(str);
    }
    return this;
  }

  getValue(): string {
    return this.buffer;
  }

  private escape(s: string): string {
    let out = "";
    for (const ch of s) {
      if (ch === this.delim) out += "\\";
      out += ch;
    }
    return out;
  }
}

/** Split a top-level VASSAL type/state string into its `\t`-separated tokens. */
export const TYPE_DELIM = "\t";
