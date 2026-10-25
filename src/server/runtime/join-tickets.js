// F2-E2-T01: eenmalige join-tickets voor /ws/game (in geheugen, 5 s geldig, gebonden aan de sessie).
import crypto from "node:crypto";
import { JOIN_TICKET_TTL_MS } from "../../../apps/web/public/shared/protocol-v1.js";

export class JoinTickets {
  constructor({ ttlMs = JOIN_TICKET_TTL_MS, clock = () => Date.now(), maxTickets = 10000 } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.maxTickets = maxTickets;
    this.tickets = new Map();
  }

  issue(sessionId) {
    if (!sessionId) throw Object.assign(new Error("Geen sessie."), { status: 401 });
    this.prune();
    if (this.tickets.size >= this.maxTickets) throw Object.assign(new Error("Te veel open join-tickets."), { status: 503 });
    const ticket = crypto.randomBytes(24).toString("base64url");
    const expiresAt = this.clock() + this.ttlMs;
    this.tickets.set(ticket, { sessionId, expiresAt });
    return { ticket, expiresAt };
  }

  // Eenmalig: een ticket is na een poging (geslaagd of niet) altijd weg.
  consume(ticket, sessionId) {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry) return false;
    if (entry.expiresAt < this.clock()) return false;
    return entry.sessionId === sessionId;
  }

  prune() {
    const now = this.clock();
    for (const [ticket, entry] of this.tickets) if (entry.expiresAt < now) this.tickets.delete(ticket);
  }
}
