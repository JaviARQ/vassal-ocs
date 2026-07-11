/**
 * Property expressions, ported at the fidelity our traits need:
 *
 * - Old-style VASSAL `PropertyExpression` conditions: `name = value` terms
 *   with = != < <= > >= =~ !~ joined by && / || (PropertyExpression.java,
 *   Expression.createPropertyExpression).
 * - A subset of BeanShell `{ … }` expressions: literals, property identifiers,
 *   GetProperty("x"), comparisons, ! && ||, + - * /, parentheses, and
 *   If(cond, a, b). Anything beyond that evaluates to null and the caller
 *   falls back (conditions become false, setters keep the old value) — the
 *   same graceful degradation as our UnknownTrait no-ops.
 *
 * Values compare numerically when both sides parse as numbers, else as
 * strings — mirroring VASSAL's ComparePropertyValue behavior.
 */

export type PropertyLookup = (name: string) => string | null;

/** Evaluate a condition (old-style or {beanshell}); unparseable → false. */
export function evaluateCondition(expr: string, lookup: PropertyLookup): boolean {
  const s = expr.trim();
  if (!s) return true; // empty match expression always passes (PropertyExpression.isNull)
  const v = s.startsWith("{")
    ? evalBeanShell(s.slice(1, -1), lookup)
    : evalOldStyle(s, lookup);
  return v === true || v === "true" || (typeof v === "number" && v !== 0);
}

/** Evaluate a value expression; plain strings pass through; failure → null. */
export function evaluateValue(expr: string, lookup: PropertyLookup): string | null {
  const s = expr.trim();
  if (!s.startsWith("{")) return substituteProperties(expr, lookup);
  const v = evalBeanShell(s.slice(1, -1), lookup);
  if (v == null) return null;
  return typeof v === "boolean" ? String(v) : String(v);
}

/** Replace $name$ references with property values (FormattedString port). */
export function substituteProperties(fmt: string, lookup: PropertyLookup): string {
  return fmt.replace(/\$([^$]+)\$/g, (whole, name: string) => lookup(name) ?? whole);
}

// ---- old-style conditions ---------------------------------------------------

function evalOldStyle(s: string, lookup: PropertyLookup): boolean {
  // split on || first, then &&; no parentheses in the old syntax
  return s.split("||").some((orTerm) =>
    orTerm.split("&&").every((term) => evalOldTerm(term.trim(), lookup)),
  );
}

const OLD_OPS = ["!=", ">=", "<=", "=~", "!~", "=", ">", "<"] as const;

function evalOldTerm(term: string, lookup: PropertyLookup): boolean {
  if (!term) return true;
  for (const op of OLD_OPS) {
    const i = term.indexOf(op);
    if (i < 0) continue;
    const name = term.substring(0, i).trim();
    const raw = term.substring(i + op.length).trim();
    const left = lookup(name) ?? "";
    const right = substituteProperties(raw, lookup);
    switch (op) {
      case "=": return compare(left, right) === 0;
      case "!=": return compare(left, right) !== 0;
      case ">": return compare(left, right) > 0;
      case ">=": return compare(left, right) >= 0;
      case "<": return compare(left, right) < 0;
      case "<=": return compare(left, right) <= 0;
      case "=~": return safeRegexTest(right, left);
      case "!~": return !safeRegexTest(right, left);
    }
  }
  return false;
}

function compare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) {
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

function safeRegexTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

// ---- BeanShell subset -------------------------------------------------------

type Value = string | number | boolean | null;

function evalBeanShell(src: string, lookup: PropertyLookup): Value {
  try {
    const p = new Parser(src, lookup);
    const v = p.parseExpression();
    p.skipWs();
    return p.atEnd() ? v : null;
  } catch {
    return null;
  }
}

class Parser {
  private i = 0;
  constructor(private readonly s: string, private readonly lookup: PropertyLookup) {}

  atEnd(): boolean {
    return this.i >= this.s.length;
  }

  skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  parseExpression(): Value {
    return this.parseOr();
  }

  private parseOr(): Value {
    let left = this.parseAnd();
    for (;;) {
      this.skipWs();
      if (this.s.startsWith("||", this.i)) {
        this.i += 2;
        const right = this.parseAnd();
        left = truthy(left) || truthy(right);
      } else return left;
    }
  }

  private parseAnd(): Value {
    let left = this.parseComparison();
    for (;;) {
      this.skipWs();
      if (this.s.startsWith("&&", this.i)) {
        this.i += 2;
        const right = this.parseComparison();
        left = truthy(left) && truthy(right);
      } else return left;
    }
  }

  private parseComparison(): Value {
    const left = this.parseAdditive();
    this.skipWs();
    for (const op of ["==", "!=", ">=", "<=", ">", "<"]) {
      if (this.s.startsWith(op, this.i)) {
        this.i += op.length;
        const right = this.parseAdditive();
        const c = compare(str(left), str(right));
        switch (op) {
          case "==": return c === 0;
          case "!=": return c !== 0;
          case ">=": return c >= 0;
          case "<=": return c <= 0;
          case ">": return c > 0;
          case "<": return c < 0;
        }
      }
    }
    return left;
  }

  private parseAdditive(): Value {
    let left = this.parseMultiplicative();
    for (;;) {
      this.skipWs();
      const ch = this.s[this.i];
      if (ch === "+" || ch === "-") {
        this.i++;
        const right = this.parseMultiplicative();
        const ln = Number(left);
        const rn = Number(right);
        if (ch === "+" && (!Number.isFinite(ln) || !Number.isFinite(rn))) {
          left = str(left) + str(right); // string concat, like Java
        } else {
          left = ch === "+" ? ln + rn : ln - rn;
        }
      } else return left;
    }
  }

  private parseMultiplicative(): Value {
    let left = this.parseUnary();
    for (;;) {
      this.skipWs();
      const ch = this.s[this.i];
      if (ch === "*" || ch === "/" || ch === "%") {
        this.i++;
        const right = this.parseUnary();
        const ln = Number(left);
        const rn = Number(right);
        left = ch === "*" ? ln * rn : ch === "/" ? Math.trunc(ln / rn) : ln % rn;
      } else return left;
    }
  }

  private parseUnary(): Value {
    this.skipWs();
    if (this.s[this.i] === "!") {
      this.i++;
      return !truthy(this.parseUnary());
    }
    if (this.s[this.i] === "-") {
      this.i++;
      return -Number(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Value {
    this.skipWs();
    const ch = this.s[this.i];
    if (ch === "(") {
      this.i++;
      const v = this.parseExpression();
      this.expect(")");
      return v;
    }
    if (ch === '"' || ch === "'") return this.parseString(ch);
    if (/[0-9.]/.test(ch)) return this.parseNumber();
    if (/[A-Za-z_]/.test(ch)) return this.parseIdentifier();
    throw new Error("unexpected char " + ch);
  }

  private parseString(quote: string): string {
    let out = "";
    this.i++;
    while (this.i < this.s.length && this.s[this.i] !== quote) {
      if (this.s[this.i] === "\\") this.i++;
      out += this.s[this.i++];
    }
    this.expect(quote);
    return out;
  }

  private parseNumber(): number {
    const m = /^[0-9]*\.?[0-9]+/.exec(this.s.slice(this.i));
    if (!m) throw new Error("bad number");
    this.i += m[0].length;
    return Number(m[0]);
  }

  private parseIdentifier(): Value {
    const m = /^[A-Za-z_][A-Za-z0-9_ ]*/.exec(this.s.slice(this.i));
    if (!m) throw new Error("bad identifier");
    // Property names may contain spaces (e.g. "SL On_Active"); trailing
    // spaces belong to the next operator, not the name.
    const name = m[0].replace(/\s+$/, "");
    this.i += name.length;

    if (name === "true") return true;
    if (name === "false") return false;
    if (name === "null") return null;

    this.skipWs();
    if (this.s[this.i] === "(") {
      this.i++;
      const args: Value[] = [];
      this.skipWs();
      if (this.s[this.i] !== ")") {
        for (;;) {
          args.push(this.parseExpression());
          this.skipWs();
          if (this.s[this.i] === ",") {
            this.i++;
            continue;
          }
          break;
        }
      }
      this.expect(")");
      return this.callFunction(name, args);
    }
    return this.lookup(name);
  }

  private callFunction(name: string, args: Value[]): Value {
    switch (name) {
      case "GetProperty":
        return this.lookup(str(args[0]));
      case "If":
        return truthy(args[0]) ? args[1] : args[2];
      case "Math_min":
        return Math.min(Number(args[0]), Number(args[1]));
      case "Math_max":
        return Math.max(Number(args[0]), Number(args[1]));
      default:
        throw new Error("unsupported function " + name);
    }
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.s[this.i] !== ch) throw new Error(`expected ${ch}`);
    this.i++;
  }
}

function truthy(v: Value): boolean {
  return v === true || v === "true" || (typeof v === "number" && v !== 0);
}

function str(v: Value): string {
  return v == null ? "" : String(v);
}
