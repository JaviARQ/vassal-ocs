/**
 * Module-level GlobalProperty values ($AxisCVP$-style refs in labels and
 * expressions resolve here after piece traits). Static initial values only;
 * SetGlobalProperty updates are future work (TODO).
 */
const globals = new Map<string, string>();

export function setGlobalProperties(props: Map<string, string>): void {
  globals.clear();
  for (const [k, v] of props) globals.set(k, v);
}

export function getGlobalProperty(key: string): string | null {
  return globals.get(key) ?? null;
}
