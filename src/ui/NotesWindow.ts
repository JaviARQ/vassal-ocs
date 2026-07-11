import {
  cloneNotes,
  emptyNotes,
  formatSecretDate,
  type NotesState,
  type SecretNote,
} from "../vmod/notes";

export interface NotesWindowCallbacks {
  /** Current committed state (captured into a working copy on open). */
  getState: () => NotesState;
  /** Save pressed: commit the working copy. */
  onCommit: (state: NotesState) => void;
  /** Cancel/close without saving. */
  onCancel: () => void;
}

const PLAYER_ID_KEY = "vb.playerId";

export function loadPlayerId(): string {
  try {
    return localStorage.getItem(PLAYER_ID_KEY) || "Player";
  } catch {
    return "Player";
  }
}

function savePlayerId(id: string): void {
  try {
    localStorage.setItem(PLAYER_ID_KEY, id);
  } catch {
    /* private mode */
  }
}

type TabId = "scenario" | "public" | "private" | "delayed";

/**
 * The VASSAL NotesWindow: Scenario / Public / Private / Delayed tabs with
 * Java's capture-on-open, Save-commits, Cancel-restores semantics. Private and
 * Delayed notes are keyed by a local player id (hotseat identity).
 */
export class NotesWindow {
  readonly el: HTMLElement;
  private working: NotesState = emptyNotes();
  private playerId = loadPlayerId();
  private activeTab: TabId = "scenario";
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private panels = new Map<TabId, HTMLElement>();
  private scenarioArea!: HTMLTextAreaElement;
  private publicArea!: HTMLTextAreaElement;
  private privateArea!: HTMLTextAreaElement;
  private delayedList!: HTMLElement;

  constructor(private readonly cb: NotesWindowCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "notes-window";

    const tabs = document.createElement("div");
    tabs.className = "side-tabs notes-tabs";
    const defs: Array<[TabId, string]> = [
      ["scenario", "Scenario"],
      ["public", "Public"],
      ["private", "Private"],
      ["delayed", "Delayed"],
    ];
    for (const [id, label] of defs) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => this.showTab(id));
      this.tabButtons.set(id, b);
      tabs.appendChild(b);
    }
    this.el.appendChild(tabs);

    this.scenarioArea = this.textPanel("scenario", "Visible to all; part of the scenario setup.");
    this.publicArea = this.textPanel("public", "Visible to all players.");
    this.buildPrivatePanel();
    this.buildDelayedPanel();
    this.buildFooter();
    this.showTab("scenario");
  }

  /** Capture the committed state into the working copy (call on window open). */
  capture(): void {
    this.working = cloneNotes(this.cb.getState());
    this.render();
  }

  private textPanel(id: TabId, hint: string): HTMLTextAreaElement {
    const panel = document.createElement("div");
    panel.className = "notes-panel";
    const p = document.createElement("p");
    p.className = "notes-hint";
    p.textContent = hint;
    const area = document.createElement("textarea");
    area.className = "notes-text";
    area.addEventListener("input", () => {
      if (id === "scenario") this.working.scenario = area.value;
      else this.working.publicNotes = area.value;
    });
    panel.append(p, area);
    this.panels.set(id, panel);
    this.el.appendChild(panel);
    return area;
  }

  private buildPrivatePanel(): void {
    const panel = document.createElement("div");
    panel.className = "notes-panel";
    const row = document.createElement("div");
    row.className = "notes-owner-row";
    const label = document.createElement("span");
    label.textContent = "You are:";
    const input = document.createElement("input");
    input.className = "notes-owner";
    input.value = this.playerId;
    input.addEventListener("change", () => {
      this.playerId = input.value.trim() || "Player";
      input.value = this.playerId;
      savePlayerId(this.playerId);
      this.render();
    });
    row.append(label, input);
    const hint = document.createElement("p");
    hint.className = "notes-hint";
    hint.textContent = "Only visible to you. Other players' private notes are preserved in saves.";
    this.privateArea = document.createElement("textarea");
    this.privateArea.className = "notes-text";
    this.privateArea.addEventListener("input", () => {
      this.working.privateNotes.set(this.playerId, this.privateArea.value);
    });
    panel.append(row, hint, this.privateArea);
    this.panels.set("private", panel);
    this.el.appendChild(panel);
  }

  private buildDelayedPanel(): void {
    const panel = document.createElement("div");
    panel.className = "notes-panel";
    const hint = document.createElement("p");
    hint.className = "notes-hint";
    hint.textContent = "Delayed notes are hidden until revealed; revealing is permanent.";
    this.delayedList = document.createElement("div");
    this.delayedList.className = "notes-delayed-list";

    const form = document.createElement("div");
    form.className = "notes-delayed-form";
    const name = document.createElement("input");
    name.placeholder = "Note name";
    const text = document.createElement("textarea");
    text.placeholder = "Hidden text…";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add delayed note";
    add.addEventListener("click", () => {
      const n = name.value.trim();
      if (!n || !text.value.trim()) return;
      const exists = this.working.secretNotes.some((s) => s.name === n && s.owner === this.playerId);
      if (exists) {
        alert(`You already have a delayed note named "${n}".`);
        return;
      }
      this.working.secretNotes.push({
        name: n,
        owner: this.playerId,
        hidden: true,
        text: text.value,
        date: formatSecretDate(new Date()),
        handle: this.playerId,
      });
      name.value = "";
      text.value = "";
      this.renderDelayed();
    });
    form.append(name, text, add);

    panel.append(hint, this.delayedList, form);
    this.panels.set("delayed", panel);
    this.el.appendChild(panel);
  }

  private buildFooter(): void {
    const footer = document.createElement("div");
    footer.className = "notes-footer";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "notes-save";
    save.textContent = "Save";
    save.addEventListener("click", () => this.cb.onCommit(cloneNotes(this.working)));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "notes-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.cb.onCancel());
    footer.append(save, cancel);
    this.el.appendChild(footer);
  }

  private showTab(id: TabId): void {
    this.activeTab = id;
    for (const [tid, btn] of this.tabButtons) btn.classList.toggle("active", tid === id);
    for (const [tid, panel] of this.panels) panel.hidden = tid !== id;
  }

  private render(): void {
    this.scenarioArea.value = this.working.scenario;
    this.publicArea.value = this.working.publicNotes;
    this.privateArea.value = this.working.privateNotes.get(this.playerId) ?? "";
    this.renderDelayed();
    this.showTab(this.activeTab);
  }

  private renderDelayed(): void {
    this.delayedList.innerHTML = "";
    if (!this.working.secretNotes.length) {
      const none = document.createElement("p");
      none.className = "notes-hint";
      none.textContent = "No delayed notes.";
      this.delayedList.appendChild(none);
      return;
    }
    for (const note of this.working.secretNotes) {
      this.delayedList.appendChild(this.renderSecret(note));
    }
  }

  private renderSecret(note: SecretNote): HTMLElement {
    const row = document.createElement("div");
    row.className = "notes-delayed-item";
    const head = document.createElement("div");
    head.className = "notes-delayed-head";
    const title = document.createElement("span");
    title.textContent = `${note.name} — ${note.owner}${note.date ? ` — ${note.date}` : ""}`;
    head.appendChild(title);
    const canSee = !note.hidden || note.owner === this.playerId;
    if (note.hidden) {
      const status = document.createElement("span");
      status.className = "notes-delayed-status";
      status.textContent = "hidden";
      head.appendChild(status);
      if (note.owner === this.playerId) {
        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.textContent = "Reveal";
        reveal.addEventListener("click", () => {
          if (!confirm(`Reveal "${note.name}" to all players? This cannot be undone.`)) return;
          note.hidden = false;
          this.renderDelayed();
        });
        head.appendChild(reveal);
      }
    }
    row.appendChild(head);
    const body = document.createElement("div");
    body.className = "notes-delayed-text";
    body.textContent = canSee ? note.text : "(hidden until revealed)";
    row.appendChild(body);
    return row;
  }
}
