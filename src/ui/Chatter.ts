export interface ChatEntry {
  time: string;
  text: string;
}

export interface DiceButtonView {
  name: string;
  text: string;
  nDice: number;
  nSides: number;
  plus: number;
  prompt: boolean;
}

export interface CardDeckView {
  id: string;
  name: string;
  count: number;
}

export interface CardPreview {
  deckName: string;
  cardName: string;
  remaining: number;
  imageUrl: string | null;
}

export interface AreaView {
  id: string;
  name: string;
}

/**
 * Small local hotseat chatter/dice panel. This is intentionally independent of
 * VASSAL dice-button parsing; it gives the browser table the basic play loop
 * needed for scenario validation while native module dice support remains M2+.
 */
export class Chatter {
  readonly el: HTMLElement;
  private readonly diceButtonsEl: HTMLElement;
  private readonly diceRowEl: HTMLElement;
  private readonly logPanelEl: HTMLElement;
  private readonly cardsPanelEl: HTMLElement;
  private readonly areasEl: HTMLElement;
  private readonly decksEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly entries: ChatEntry[] = [];
  private deckDraw: ((deckId: string) => CardPreview | null) | null = null;

  constructor() {
    this.el = document.createElement("aside");
    this.el.className = "chatter";

    const title = document.createElement("div");
    title.className = "chatter-title";
    title.textContent = "Hotseat Log";
    this.el.appendChild(title);

    this.diceButtonsEl = document.createElement("div");
    this.diceButtonsEl.className = "chatter-tools";
    this.el.appendChild(this.diceButtonsEl);

    this.diceRowEl = document.createElement("div");
    this.diceRowEl.className = "chatter-tools";
    this.el.appendChild(this.diceRowEl);

    const tabs = document.createElement("div");
    tabs.className = "side-tabs";
    this.el.appendChild(tabs);
    for (const [id, text] of [["log", "Log"], ["cards", "Cards"]] as const) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.addEventListener("click", () => this.showTab(id));
      tabs.appendChild(btn);
      this.tabButtons.set(id, btn);
    }

    this.logPanelEl = document.createElement("div");
    this.logPanelEl.className = "side-panel";
    this.el.appendChild(this.logPanelEl);

    this.cardsPanelEl = document.createElement("div");
    this.cardsPanelEl.className = "side-panel";
    this.el.appendChild(this.cardsPanelEl);

    this.areasEl = document.createElement("div");
    this.areasEl.className = "chatter-areas";
    this.cardsPanelEl.appendChild(this.areasEl);

    this.decksEl = document.createElement("div");
    this.decksEl.className = "chatter-decks";
    this.cardsPanelEl.appendChild(this.decksEl);

    this.previewEl = document.createElement("div");
    this.previewEl.className = "card-preview";
    this.cardsPanelEl.appendChild(this.previewEl);

    this.logEl = document.createElement("div");
    this.logEl.className = "chatter-log";
    this.logPanelEl.appendChild(this.logEl);

    const form = document.createElement("form");
    form.className = "chatter-roll";
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.value = "d6";
    this.input.setAttribute("aria-label", "Dice expression");
    const roll = document.createElement("button");
    roll.type = "submit";
    roll.textContent = "Roll";
    form.append(this.input, roll);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.roll(this.input.value);
    });
    this.el.appendChild(form);

    this.add("Table ready: local hotseat mode.");
    this.setDiceButtons([]);
    this.showTab("log");
  }

  setDiceButtons(_buttons: DiceButtonView[]): void {
    this.diceButtonsEl.innerHTML = "";

    const label = document.createElement("div");
    label.className = "chatter-section-title";
    label.textContent = "Dice";
    this.diceButtonsEl.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "dice-grid";
    const buttons = [
      { text: "1d6", action: () => this.rollDice(1, 6, 0, "1d6") },
      { text: "2d6", action: () => this.rollDice(2, 6, 0, "2d6") },
      { text: "10d6", action: () => this.rollDice(10, 6, 0, "10d6") },
      { text: "Nd6", action: () => this.promptNd6() },
      { text: "NdS+m", action: () => this.promptNdSm() },
    ];
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.text;
      btn.addEventListener("click", b.action);
      grid.appendChild(btn);
    }
    this.diceButtonsEl.appendChild(grid);
  }

  /**
   * DiceBot row (port of the ASLDiceBot report shapes): DR rolls a colored
   * and a white d6 and reports `*** (CAT DR) colored,white ***`, dr a single
   * die as `*** (CAT dr) n ***`. Categories mirror the module's dice toolbar.
   */
  setDiceBotRow(enabled: boolean): void {
    this.diceRowEl.innerHTML = "";
    if (!enabled) return;

    const label = document.createElement("div");
    label.className = "chatter-section-title";
    label.textContent = "DR / dr";
    this.diceRowEl.appendChild(label);

    const row = document.createElement("div");
    row.className = "card-draw-row";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "DR category");
    for (const cat of ["IFT", "TH", "TK", "MC", "Rally", "CC", "TC", "Other"]) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
    const dr2 = document.createElement("button");
    dr2.type = "button";
    dr2.textContent = "DR";
    dr2.addEventListener("click", () => this.rollDR(select.value));
    const dr1 = document.createElement("button");
    dr1.type = "button";
    dr1.textContent = "dr";
    dr1.addEventListener("click", () => this.rollDr(select.value));
    row.append(select, dr2, dr1);
    this.diceRowEl.appendChild(row);
  }

  /** 2d6 DR: colored die first, white second (ASLDiceBot.DR). */
  rollDR(category = "Other"): ChatEntry {
    const colored = 1 + Math.floor(Math.random() * 6);
    const white = 1 + Math.floor(Math.random() * 6);
    return this.add(`*** (${category} DR) ${colored},${white} ***   total: ${colored + white}`);
  }

  /** Single-die dr (ASLDiceBot.dr). */
  rollDr(category = "Other"): ChatEntry {
    const die = 1 + Math.floor(Math.random() * 6);
    return this.add(`*** (${category} dr) ${die} ***`);
  }

  setCardDecks(decks: CardDeckView[], onDraw: (deckId: string) => CardPreview | null): void {
    this.deckDraw = onDraw;
    this.decksEl.innerHTML = "";
    if (!decks.length) return;

    const label = document.createElement("div");
    label.className = "chatter-section-title";
    label.textContent = "Cards";
    this.decksEl.appendChild(label);

    const row = document.createElement("div");
    row.className = "card-draw-row";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Card deck");
    for (const deck of decks) {
      const opt = document.createElement("option");
      opt.value = deck.id;
      opt.textContent = `${deck.name} (${deck.count})`;
      select.appendChild(opt);
    }
    const draw = document.createElement("button");
    draw.type = "button";
    draw.textContent = "Draw";
    draw.addEventListener("click", () => this.drawDeck(select.value));
    row.append(select, draw);
    this.decksEl.appendChild(row);
  }

  setAreas(areas: AreaView[], onSelect: (areaId: string) => void): void {
    this.areasEl.innerHTML = "";
    if (!areas.length) return;
    const label = document.createElement("div");
    label.className = "chatter-section-title";
    label.textContent = "Areas";
    this.areasEl.appendChild(label);
    const grid = document.createElement("div");
    grid.className = "area-grid";
    for (const area of areas) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = area.name;
      btn.addEventListener("click", () => onSelect(area.id));
      grid.appendChild(btn);
    }
    this.areasEl.appendChild(grid);
  }

  add(text: string): ChatEntry {
    const entry = { time: formatTime(new Date()), text };
    this.entries.push(entry);
    this.renderEntry(entry);
    return entry;
  }

  roll(expr: string): ChatEntry {
    const parsed = parseDice(expr);
    if (!parsed) return this.add(`Invalid roll: ${expr.trim() || "(empty)"}`);
    return this.rollDice(parsed.count, parsed.sides, parsed.plus, parsed.label);
  }

  rollDice(count: number, sides: number, plus = 0, label = `${count === 1 ? "" : count}d${sides}`): ChatEntry {
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const subtotal = rolls.reduce((a, b) => a + b, 0);
    const total = subtotal + plus;
    return this.add(`${label}: [${rolls.join(", ")}] = ${total}`);
  }

  log(): ChatEntry[] {
    return [...this.entries];
  }

  private showTab(id: "log" | "cards"): void {
    this.logPanelEl.hidden = id !== "log";
    this.cardsPanelEl.hidden = id !== "cards";
    for (const [key, btn] of this.tabButtons) btn.classList.toggle("active", key === id);
  }

  private drawDeck(deckId: string): void {
    const card = this.deckDraw?.(deckId);
    if (!card) {
      this.add("Deck is empty.");
      return;
    }
    this.showCard(card);
    this.add(`Drew ${card.cardName} from ${card.deckName}. ${card.remaining} left.`);
  }

  private showCard(card: CardPreview): void {
    this.previewEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "card-preview-title";
    title.textContent = card.cardName;
    this.previewEl.appendChild(title);
    if (card.imageUrl) {
      const img = document.createElement("img");
      img.alt = card.cardName;
      img.src = card.imageUrl;
      this.previewEl.appendChild(img);
    }
  }

  private renderEntry(entry: ChatEntry): void {
    const row = document.createElement("div");
    row.className = "chatter-entry";
    const time = document.createElement("span");
    time.className = "chatter-time";
    time.textContent = entry.time;
    const text = document.createElement("span");
    text.className = "chatter-text";
    text.textContent = entry.text;
    row.append(time, text);
    this.logEl.appendChild(row);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private promptNd6(): void {
    const raw = window.prompt("Number of d6", "1");
    if (raw == null) return;
    const count = Number.parseInt(raw, 10);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      this.add(`Invalid roll: ${raw}d6`);
      return;
    }
    this.rollDice(count, 6, 0, `${count}d6`);
  }

  private promptNdSm(): void {
    const raw = window.prompt("Dice as N,S,m", "1,6,0");
    if (raw == null) return;
    const [nRaw = "1", sRaw = "6", mRaw = "0"] = raw.split(",").map((s) => s.trim());
    const count = Number.parseInt(nRaw, 10);
    const sides = Number.parseInt(sRaw, 10);
    const plus = Number.parseInt(mRaw, 10);
    if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(sides) || sides < 2 || sides > 1000 || !Number.isInteger(plus)) {
      this.add(`Invalid roll: ${raw}`);
      return;
    }
    const label = `${count}d${sides}${plus ? (plus > 0 ? `+${plus}` : plus) : ""}`;
    this.rollDice(count, sides, plus, label);
  }
}

function parseDice(expr: string): { count: number; sides: number; plus: number; label: string } | null {
  const raw = expr.trim().toLowerCase();
  const m = /^(\d*)d(\d+)(?:([+-])(\d+))?$/.exec(raw);
  if (!m) return null;
  const count = m[1] ? Number.parseInt(m[1], 10) : 1;
  const sides = Number.parseInt(m[2], 10);
  const plus = m[4] ? Number.parseInt(m[4], 10) * (m[3] === "-" ? -1 : 1) : 0;
  if (!Number.isInteger(count) || count < 1 || count > 100) return null;
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) return null;
  const label = `${count === 1 ? "" : count}d${sides}${plus ? (plus > 0 ? `+${plus}` : plus) : ""}`;
  return { count, sides, plus, label };
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
