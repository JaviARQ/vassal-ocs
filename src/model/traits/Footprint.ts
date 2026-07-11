import { SequenceDecoder } from "../../vmod/sequence";
import { parseKeyStroke, type KeyStroke } from "../keystroke";
import type { GamePiece, KeyCommand, MovementTrailView, Trait } from "../piece";

/** VASSAL `footprint;` — Movement Trail. */
export class Footprint implements Trait {
  readonly id = "footprint;";
  private trailKey: KeyStroke | null = null;
  private trailKeyOn: KeyStroke | null = null;
  private trailKeyOff: KeyStroke | null = null;
  private trailKeyClear: KeyStroke | null = null;
  private menuCommand = "Movement Trail";
  private initiallyVisible = false;
  private globallyVisible = false;
  private globalVisibility = false;
  private localVisibility = false;
  private circleRadius = 10;
  private fillColor = "#ffffff";
  private lineColor = "#000000";
  private selectedTransparency = 100;
  private unselectedTransparency = 50;
  private lineWidth = 1;
  private startMapId = "";
  private points: Array<{ x: number; y: number }> = [];
  private initialized = false;
  private everInitialized = false;

  constructor(type: string) {
    const st = new SequenceDecoder(type.substring(this.id.length), ";");
    this.trailKey = parseKeyStroke(st.nextTokenOr("84,0"));
    this.menuCommand = st.nextTokenOr("Movement Trail");
    this.initiallyVisible = st.nextBoolean(false);
    this.globallyVisible = st.nextBoolean(false);
    this.circleRadius = st.nextInt(10);
    this.fillColor = parseColor(st.nextTokenOr("255,255,255"), "#ffffff");
    this.lineColor = parseColor(st.nextTokenOr("0,0,0"), "#000000");
    this.selectedTransparency = st.nextInt(100);
    this.unselectedTransparency = st.nextInt(50);
    st.nextInt(20); // edgePointBuffer
    st.nextInt(30); // edgeDisplayBuffer
    this.lineWidth = st.nextDouble(1);
    this.trailKeyOn = parseKeyStroke(st.nextTokenOr(""));
    this.trailKeyOff = parseKeyStroke(st.nextTokenOr(""));
    this.trailKeyClear = parseKeyStroke(st.nextTokenOr(""));
    st.nextTokenOr(""); // description
    st.nextBoolean(false); // ignoreSameLocation
    this.localVisibility = this.initiallyVisible;
  }

  setState(s: string): void {
    const st = new SequenceDecoder(s, ";");
    this.globalVisibility = st.nextBoolean(this.initiallyVisible);
    this.localVisibility = this.globalVisibility;
    this.startMapId = st.nextTokenOr("");
    const count = st.nextInt(0);
    this.points = [];
    for (let i = 0; i < count; i++) {
      const p = new SequenceDecoder(st.nextTokenOr(""), ",");
      this.points.push({ x: p.nextInt(0), y: p.nextInt(0) });
    }
    this.everInitialized = st.nextBoolean(false);
    st.nextInt(count); // lastPointListSize
  }

  getState(): string {
    const parts = [String(this.globalVisibility), this.startMapId, String(this.points.length)];
    for (const p of this.points) parts.push(`${Math.round(p.x)},${Math.round(p.y)}`);
    parts.push(String(this.everInitialized), String(this.points.length));
    return parts.join(";");
  }

  keyCommands(piece: GamePiece): KeyCommand[] {
    const out: KeyCommand[] = [];
    if (this.menuCommand && this.trailKey) {
      out.push({ name: this.menuCommand, stroke: this.trailKey, perform: () => { this.toggle(); return true; } });
    }
    if (this.trailKeyOn) out.push({ name: "", stroke: this.trailKeyOn, perform: () => { this.setVisible(true); return true; } });
    if (this.trailKeyOff) out.push({ name: "", stroke: this.trailKeyOff, perform: () => { this.setVisible(false); return true; } });
    if (this.trailKeyClear) out.push({ name: "", stroke: this.trailKeyClear, perform: () => { this.clearMoveTrail(piece); return true; } });
    return out;
  }

  setMoved(piece: GamePiece, moved: boolean): void {
    if (moved) this.recordMovePoint(piece);
    else this.clearMoveTrail(piece);
  }

  recordMovePoint(piece: GamePiece): void {
    if (!this.initialized) {
      this.localVisibility = this.initiallyVisible;
      this.initialized = true;
      if (!this.everInitialized) {
        this.globalVisibility = this.initiallyVisible;
        this.everInitialized = true;
      }
    }
    if (this.startMapId && piece.mapId && this.startMapId !== piece.mapId) {
      this.clearMoveTrail(piece);
    }
    this.startMapId = piece.mapId;
    this.addPoint(piece.x, piece.y);
  }

  clearMoveTrail(piece: GamePiece): void {
    this.points = [];
    this.addPoint(piece.x, piece.y);
    if (!this.initialized) {
      this.localVisibility = this.initiallyVisible;
      this.initialized = true;
      if (!this.everInitialized) {
        this.globalVisibility = this.initiallyVisible;
        this.everInitialized = true;
      }
    }
  }

  movementTrail(): MovementTrailView | null {
    if (!this.isVisible() || this.points.length === 0) return null;
    return {
      visible: true,
      points: this.points.map((p) => ({ ...p })),
      radius: this.circleRadius,
      fill: this.fillColor,
      stroke: this.lineColor,
      lineWidth: this.lineWidth,
      alphaSelected: clampPercent(this.selectedTransparency) / 100,
      alphaUnselected: clampPercent(this.unselectedTransparency) / 100,
    };
  }

  private addPoint(x: number, y: number): void {
    const last = this.points[this.points.length - 1];
    if (!last || Math.round(last.x) !== Math.round(x) || Math.round(last.y) !== Math.round(y)) {
      this.points.push({ x, y });
    }
  }

  private isVisible(): boolean {
    return this.globallyVisible ? this.globalVisibility : this.localVisibility;
  }

  private toggle(): void {
    this.initialized = true;
    this.everInitialized = true;
    this.setVisible(!this.isVisible());
  }

  private setVisible(on: boolean): void {
    if (this.globallyVisible) this.globalVisibility = on;
    this.localVisibility = on;
  }
}

function parseColor(raw: string, fallback: string): string {
  const parts = raw.split(",").map((p) => Number.parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}
