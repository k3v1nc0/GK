// F3-E1-T02: een editorcommand is een atomaire mutatie: document + revision + refs + operation in een transactie.
import { docKeyFor, kindSpec, validateDocument } from "../../shared/authoring/kinds.js";
import { DocumentRepository } from "./document-repository.js";
import { authoringError, sha256, stableStringify } from "./stable-json.js";

const COMMANDS = new Set(["create", "update", "archive", "restore"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,120}$/;

function nowIso() {
  return new Date().toISOString();
}

export class CommandService {
  constructor(db, options = {}) {
    this.db = db;
    this.documents = options.documents || new DocumentRepository(db);
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
  }

  // input: { requestId, command, kind, docKey?, body?, expectedRevision? }; actor komt altijd uit de sessie.
  execute(input, actor) {
    const command = String(input?.command || "");
    const requestId = String(input?.requestId || "");
    if (!COMMANDS.has(command)) throw authoringError(400, "COMMAND_UNKNOWN", "Onbekend command.");
    if (!REQUEST_ID_PATTERN.test(requestId)) throw authoringError(400, "REQUEST_ID_INVALID", "requestId ontbreekt of is ongeldig.");
    const payload = {
      command,
      kind: input.kind || null,
      docKey: input.docKey || null,
      body: input.body === undefined ? null : input.body,
      expectedRevision: input.expectedRevision === undefined ? null : Number(input.expectedRevision)
    };
    const payloadSha = sha256(stableStringify(payload));

    this.db.exec("BEGIN IMMEDIATE");
    let open = true;
    try {
      const previous = this.documents.operation(requestId);
      if (previous) {
        this.db.exec("ROLLBACK");
        open = false;
        if (previous.payload_sha256 !== payloadSha) {
          throw authoringError(409, "REQUEST_ID_REUSED", "Dit requestId is al gebruikt met andere inhoud.");
        }
        return Object.assign(JSON.parse(previous.response_json), { replayed: true });
      }
      const stamp = nowIso();
      const response = this.apply(payload, actor, stamp);
      this.documents.recordOperation(requestId, response.docKey, command, payloadSha, response, actor, stamp);
      this.db.exec("COMMIT");
      open = false;
      if (this.onChange) this.onChange(response);
      return response;
    } catch (error) {
      if (open) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  apply(payload, actor, stamp) {
    if (payload.command === "create") return this.create(payload, actor, stamp);
    const current = this.documents.get(String(payload.docKey || ""));
    if (!current) throw authoringError(404, "DOC_NOT_FOUND", "Document niet gevonden.");
    if (!Number.isInteger(payload.expectedRevision)) throw authoringError(428, "IF_MATCH_REQUIRED", "If-Match (revision) is verplicht.");
    if (payload.expectedRevision !== current.revision) {
      throw authoringError(409, "STALE_REVISION", "Iemand anders heeft dit al gewijzigd. Ververs en probeer opnieuw.", { currentRevision: current.revision });
    }
    if (payload.command === "update") return this.update(current, payload, actor, stamp);
    if (payload.command === "archive") return this.setArchived(current, true, actor, stamp);
    return this.setArchived(current, false, actor, stamp);
  }

  checkRefs(refs) {
    const missing = refs.filter((ref) => {
      const target = this.documents.get(ref);
      return !target || target.archived;
    });
    if (missing.length) throw authoringError(422, "REF_MISSING", "Verwijst naar iets dat niet (meer) bestaat: " + missing.join(", "), { missing });
  }

  validated(kind, body) {
    const result = validateDocument(kind, body);
    if (!result.ok) throw authoringError(422, "VALIDATION_FAILED", result.issues[0].message, { issues: result.issues });
    return result;
  }

  create(payload, actor, stamp) {
    const kind = String(payload.kind || "");
    if (!kindSpec(kind)) throw authoringError(400, "KIND_UNKNOWN", "Onbekend soort document.");
    const { refs } = this.validated(kind, payload.body);
    const docKey = docKeyFor(kind, payload.body);
    if (this.documents.get(docKey)) throw authoringError(409, "DOC_EXISTS", "Dit bestaat al: " + docKey);
    this.checkRefs(refs);
    this.documents.insert({ docKey, kind, body: payload.body, legacyRef: null }, actor, stamp);
    this.documents.replaceRefs(docKey, refs);
    return { ok: true, docKey, kind, revision: 1 };
  }

  update(current, payload, actor, stamp) {
    if (current.archived) throw authoringError(409, "DOC_ARCHIVED", "Gearchiveerd document kan niet worden gewijzigd.");
    const { refs } = this.validated(current.kind, payload.body);
    if (docKeyFor(current.kind, payload.body) !== current.docKey) throw authoringError(422, "ID_IMMUTABLE", "De ID kan niet worden gewijzigd.");
    this.checkRefs(refs);
    if (this.documents.updateIfRevision(current.docKey, current.revision, { body: payload.body }, actor, stamp) !== 1) {
      throw authoringError(409, "STALE_REVISION", "Iemand anders heeft dit al gewijzigd.");
    }
    this.documents.replaceRefs(current.docKey, refs);
    return { ok: true, docKey: current.docKey, kind: current.kind, revision: current.revision + 1 };
  }

  setArchived(current, archived, actor, stamp) {
    if (kindSpec(current.kind)?.singleton && archived) throw authoringError(409, "SINGLETON", "Projectinstellingen kunnen niet worden gearchiveerd.");
    if (archived) {
      const backlinks = this.documents.activeBacklinks(current.docKey);
      if (backlinks.length) throw authoringError(409, "REF_IN_USE", "Nog in gebruik door: " + backlinks.join(", "), { backlinks });
    } else {
      this.checkRefs(this.db.prepare("SELECT to_doc_key FROM authoring_refs WHERE from_doc_key = ?").all(current.docKey).map((row) => row.to_doc_key));
    }
    if (this.documents.updateIfRevision(current.docKey, current.revision, { archived }, actor, stamp) !== 1) {
      throw authoringError(409, "STALE_REVISION", "Iemand anders heeft dit al gewijzigd.");
    }
    return { ok: true, docKey: current.docKey, kind: current.kind, revision: current.revision + 1, archived };
  }
}
