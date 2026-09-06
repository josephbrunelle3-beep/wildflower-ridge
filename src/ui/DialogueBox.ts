import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import jasper from '../data/dialogue/jasper.json';
import { ListMenu } from './ListMenu';
import { COLORS, drawPanel, makeText } from './Panel';

export interface DialogueNode {
  lines: string[];
  choices?: { text: string; next: string }[];
  end?: string;
}
export interface DialogueScript {
  name: string;
  nodes: Record<string, DialogueNode>;
}

const SCRIPTS: Record<string, DialogueScript> = { jasper: jasper as DialogueScript };

const W = 720;
const H = 130;
const X = (GAME_WIDTH - W) / 2;
const Y = GAME_HEIGHT - 16 - 44 - 40 - H;
const CHARS_PER_SEC = 40;

/** Typewriter dialogue box with branching choices. */
export class DialogueBox {
  isOpen = false;
  private readonly scene: Phaser.Scene;
  private g?: Phaser.GameObjects.Graphics;
  private nameText?: Phaser.GameObjects.Text;
  private body?: Phaser.GameObjects.Text;
  private more?: Phaser.GameObjects.Text;
  private choices?: ListMenu;
  private script?: DialogueScript;
  private npcId = '';
  private node?: DialogueNode;
  private lineIndex = 0;
  private shown = 0;
  private choosing = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(npcId: string, nodeId: string): void {
    const script = SCRIPTS[npcId];
    if (!script || !script.nodes[nodeId]) return;
    this.close();
    this.isOpen = true;
    this.npcId = npcId;
    this.script = script;
    this.g = this.scene.add.graphics().setDepth(30);
    drawPanel(this.g, X, Y, W, H, 10);
    this.g.fillStyle(COLORS.wood);
    this.g.fillRoundedRect(X + 16, Y - 14, 130, 28, 6);
    this.nameText = makeText(this.scene, X + 81, Y, script.name, 16, COLORS.cream).setOrigin(0.5).setDepth(31);
    this.body = makeText(this.scene, X + 24, Y + 22, '', 19, COLORS.ink, { wordWrap: { width: W - 48 } }).setDepth(31);
    this.more = makeText(this.scene, X + W - 24, Y + H - 24, '▼ E', 14, COLORS.inkLight).setOrigin(1, 0.5).setDepth(31).setVisible(false);
    this.goTo(nodeId);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.g?.destroy();
    this.nameText?.destroy();
    this.body?.destroy();
    this.more?.destroy();
    this.choices?.destroy();
    this.choices = undefined;
    this.choosing = false;
  }

  update(dtMs: number): void {
    if (!this.isOpen || !this.node || this.choosing) return;
    const line = this.node.lines[this.lineIndex] ?? '';
    if (this.shown < line.length) {
      this.shown = Math.min(line.length, this.shown + (dtMs / 1000) * CHARS_PER_SEC);
      this.body?.setText(line.slice(0, Math.floor(this.shown)));
      this.more?.setVisible(false);
    } else {
      this.more?.setVisible(true);
    }
  }

  /** E / Enter: finish the line, advance, or confirm a choice. */
  advance(): void {
    if (!this.isOpen || !this.node) return;
    if (this.choosing) {
      this.choices?.select();
      return;
    }
    const line = this.node.lines[this.lineIndex] ?? '';
    if (this.shown < line.length) {
      this.shown = line.length;
      this.body?.setText(line);
      return;
    }
    if (this.lineIndex < this.node.lines.length - 1) {
      this.lineIndex += 1;
      this.shown = 0;
      return;
    }
    if (this.node.choices?.length) {
      this.showChoices();
      return;
    }
    const end = this.node.end ?? 'end';
    const id = this.npcId;
    this.close();
    bus.emit(EV.DIALOGUE_END, id, end);
  }

  move(dir: number): void {
    if (this.choosing) this.choices?.move(dir);
  }

  private goTo(nodeId: string): void {
    this.node = this.script?.nodes[nodeId];
    this.lineIndex = 0;
    this.shown = 0;
    this.choosing = false;
    this.choices?.destroy();
    this.choices = undefined;
    this.body?.setText('');
  }

  private showChoices(): void {
    if (!this.node?.choices) return;
    this.choosing = true;
    this.more?.setVisible(false);
    this.choices = new ListMenu(this.scene, X + 40, Y + 56, 24, 18);
    this.choices.container.setDepth(32);
    this.choices.setOptions(
      this.node.choices.map((c) => ({ label: c.text, onSelect: () => this.goTo(c.next) })),
      false,
    );
  }
}
