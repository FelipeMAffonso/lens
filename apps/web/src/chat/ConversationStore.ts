// CJ-W53 — in-memory + localStorage-persisted conversation turn list.
// One logical conversation per `sessionId`. Drops older turns when capped.

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

const STORAGE_PREFIX = "lens.chat.v1.";
const MAX_TURNS = 50;

function newId(): string {
  // crypto.randomUUID is universal on evergreen browsers. Guarded for test env.
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g && "randomUUID" in g) return g.randomUUID();
  return `t_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}

export class ConversationStore {
  readonly sessionId: string;
  private turns: ChatTurn[] = [];

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? newId();
    this.load();
  }

  append(role: ChatTurn["role"], text: string): ChatTurn {
    const turn: ChatTurn = { id: newId(), role, text, at: new Date().toISOString() };
    this.turns.push(turn);
    if (this.turns.length > MAX_TURNS) {
      this.turns = this.turns.slice(this.turns.length - MAX_TURNS);
    }
    this.save();
    return turn;
  }

  all(): ChatTurn[] {
    return this.turns.slice();
  }

  lastUserText(): string | undefined {
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const t = this.turns[i]!;
      if (t.role === "user") return t.text;
    }
    return undefined;
  }

  clear(): void {
    this.turns = [];
    this.save();
  }

  private key(): string {
    return `${STORAGE_PREFIX}${this.sessionId}`;
  }

  private load(): void {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(this.key()) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.turns = parsed.filter(
          (t): t is ChatTurn =>
            !!t &&
            typeof t === "object" &&
            typeof (t as ChatTurn).id === "string" &&
            ((t as ChatTurn).role === "user" || (t as ChatTurn).role === "assistant") &&
            typeof (t as ChatTurn).text === "string",
        );
      }
    } catch {
      // ignore — corrupt storage; start empty
    }
  }

  private save(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(this.key(), JSON.stringify(this.turns));
    } catch {
      // silent — quota exceeded or storage disabled
    }
  }
}
