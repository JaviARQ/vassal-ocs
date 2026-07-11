/**
 * VASSAL NotesWindow state + save-command codec. Formats are exact ports of
 * the Java sources (NotesWindow, noteswindow/PrivateNotesController,
 * noteswindow/SecretNotesController, configure/TextConfigurer):
 *
 *   NOTES\t<escaped scenario text>
 *   PNOTES\t<escaped public text>
 *   PNOTE\t<owner>\t<escaped text>                          (one per owner)
 *   SNOTE\t<name>\t<owner>\t<hidden>\t<escaped>\t<date>\t<handle>
 *
 * where <escaped> is TextConfigurer.escapeNewlines (a per-line
 * SequenceEncoder('|') with blank-line tokens and a dropped trailing newline)
 * and <date> is "MM/dd/yyyy h:mm a" (may be empty).
 */

import { SequenceDecoder, SequenceEncoder } from "./sequence";

export const SCENARIO_PREFIX = "NOTES\t";
export const PUBLIC_PREFIX = "PNOTES\t";
export const PRIVATE_PREFIX = "PNOTE\t";
export const SECRET_PREFIX = "SNOTE\t";

export interface SecretNote {
  name: string;
  owner: string;
  hidden: boolean;
  text: string;
  /** "MM/dd/yyyy h:mm a" or "" (kept as the raw string for byte fidelity). */
  date: string;
  handle: string;
}

export interface NotesState {
  scenario: string;
  publicNotes: string;
  /** owner -> text. All owners are preserved, not just the local player. */
  privateNotes: Map<string, string>;
  secretNotes: SecretNote[];
}

export function emptyNotes(): NotesState {
  return { scenario: "", publicNotes: "", privateNotes: new Map(), secretNotes: [] };
}

export function cloneNotes(state: NotesState): NotesState {
  return {
    scenario: state.scenario,
    publicNotes: state.publicNotes,
    privateNotes: new Map(state.privateNotes),
    secretNotes: state.secretNotes.map((n) => ({ ...n })),
  };
}

/** Verbatim port of TextConfigurer.escapeNewlines (Java quirks included). */
export function escapeNewlines(s: string): string {
  const se = new SequenceEncoder("|");
  // StringTokenizer(s, "\n\r", true): tokens are runs of other chars plus
  // each \n / \r as its own token.
  const tokens = s.split(/(\n|\r)/).filter((t) => t !== "");
  let wasNewLine = true;
  for (const token of tokens) {
    switch (token.charAt(0)) {
      case "\n":
        if (wasNewLine) se.append("");
        wasNewLine = true;
        break;
      case "\r":
        break;
      default:
        se.append(token);
        wasNewLine = false;
    }
  }
  return se.getValue();
}

/** Verbatim port of TextConfigurer.restoreNewlines. */
export function restoreNewlines(s: string): string {
  const dec = new SequenceDecoder(s, "|");
  const parts: string[] = [];
  while (dec.hasMoreTokens()) parts.push(dec.nextToken());
  return parts.join("\n");
}

/** Java SecretNotesController INTERNAL_DATETIME_FORMAT: "MM/dd/yyyy h:mm a". */
export function formatSecretDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${mm}/${dd}/${yyyy} ${h}:${min} ${ampm}`;
}

/** Apply one save-stream command to the state. Returns false if not a notes command. */
export function decodeNotesCommand(command: string, state: NotesState): boolean {
  if (command.startsWith(SCENARIO_PREFIX)) {
    state.scenario = restoreNewlines(command.substring(SCENARIO_PREFIX.length));
    return true;
  }
  if (command.startsWith(PUBLIC_PREFIX)) {
    state.publicNotes = restoreNewlines(command.substring(PUBLIC_PREFIX.length));
    return true;
  }
  if (command.startsWith(PRIVATE_PREFIX)) {
    const st = new SequenceDecoder(command.substring(PRIVATE_PREFIX.length), "\t");
    const owner = st.nextTokenOr("");
    const text = st.hasMoreTokens() ? restoreNewlines(st.nextToken()) : "";
    state.privateNotes.set(owner, text);
    return true;
  }
  if (command.startsWith(SECRET_PREFIX)) {
    const st = new SequenceDecoder(command.substring(SECRET_PREFIX.length), "\t");
    const note: SecretNote = {
      name: st.nextTokenOr(""),
      owner: st.nextTokenOr(""),
      hidden: st.nextTokenOr("") === "true",
      text: restoreNewlines(st.nextTokenOr("")),
      date: st.hasMoreTokens() ? st.nextToken() : "",
      handle: st.hasMoreTokens() ? st.nextToken() : "",
    };
    // Secret notes are keyed by (name, owner); a re-send replaces (reveal).
    const idx = state.secretNotes.findIndex((n) => n.name === note.name && n.owner === note.owner);
    if (idx >= 0) state.secretNotes[idx] = note;
    else state.secretNotes.push(note);
    return true;
  }
  return false;
}

/**
 * Serialize the state to save-stream commands. NOTES and PNOTES are always
 * emitted, even when empty — Java's GameState does the same and the fixture
 * save contains an empty `PNOTES\t`.
 */
export function encodeNotesCommands(state: NotesState): string[] {
  const out: string[] = [
    SCENARIO_PREFIX + escapeNewlines(state.scenario),
    PUBLIC_PREFIX + escapeNewlines(state.publicNotes),
  ];
  for (const [owner, text] of state.privateNotes) {
    out.push(PRIVATE_PREFIX + new SequenceEncoder("\t").append(owner).append(escapeNewlines(text)).getValue());
  }
  for (const n of state.secretNotes) {
    out.push(
      SECRET_PREFIX +
        new SequenceEncoder("\t")
          .append(n.name)
          .append(n.owner)
          .append(n.hidden)
          .append(escapeNewlines(n.text))
          .append(n.date)
          .append(n.handle)
          .getValue(),
    );
  }
  return out;
}

/** Flattened non-empty note texts (deprecated __vb.savedNotes() shape). */
export function flattenNotes(state: NotesState): string[] {
  const out: string[] = [];
  if (state.scenario.trim()) out.push(state.scenario);
  if (state.publicNotes.trim()) out.push(state.publicNotes);
  for (const text of state.privateNotes.values()) if (text.trim()) out.push(text);
  for (const n of state.secretNotes) if (n.text.trim() && !n.hidden) out.push(n.text);
  return out;
}

/** One-line summary for the chat log after a save import. */
export function notesSummary(state: NotesState): string | null {
  const parts: string[] = [];
  if (state.scenario.trim()) parts.push(`scenario (${state.scenario.split("\n").length} lines)`);
  if (state.publicNotes.trim()) parts.push("public");
  const privates = [...state.privateNotes.values()].filter((t) => t.trim()).length;
  if (privates) parts.push(`${privates} private`);
  if (state.secretNotes.length) parts.push(`${state.secretNotes.length} delayed`);
  return parts.length ? `Loaded notes: ${parts.join(", ")}.` : null;
}
