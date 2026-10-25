// F3-E1-T02: leest en schrijft canonieke documenten. Schrijft nooit naar editor_nodes of editor_node_edges.

function rowToDocument(row) {
  if (!row) return null;
  return {
    docKey: row.doc_key,
    kind: row.kind,
    revision: row.revision,
    body: JSON.parse(row.body_json),
    archived: row.archived === 1,
    legacyRef: row.legacy_ref || null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || null
  };
}

export class DocumentRepository {
  constructor(db) {
    this.db = db;
  }

  get(docKey) {
    return rowToDocument(this.db.prepare("SELECT * FROM authoring_documents WHERE doc_key = ?").get(docKey));
  }

  list({ kind = null, includeArchived = false, limit = 200, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 200)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const where = [];
    const params = [];
    if (kind) { where.push("kind = ?"); params.push(kind); }
    if (!includeArchived) where.push("archived = 0");
    const sql = "SELECT * FROM authoring_documents" + (where.length ? " WHERE " + where.join(" AND ") : "") +
      " ORDER BY doc_key LIMIT ? OFFSET ?";
    return this.db.prepare(sql).all(...params, safeLimit, safeOffset).map(rowToDocument);
  }

  allDocuments() {
    return this.db.prepare("SELECT * FROM authoring_documents ORDER BY doc_key").all().map(rowToDocument);
  }

  activeDocuments() {
    return this.db.prepare("SELECT * FROM authoring_documents WHERE archived = 0 ORDER BY doc_key").all().map(rowToDocument);
  }

  insert(doc, actor, stamp) {
    this.db.prepare(`
      INSERT INTO authoring_documents (doc_key, kind, revision, body_json, archived, legacy_ref, created_at, updated_at, updated_by)
      VALUES (?, ?, 1, ?, 0, ?, ?, ?, ?)
    `).run(doc.docKey, doc.kind, JSON.stringify(doc.body), doc.legacyRef || null, stamp, stamp, actor || null);
  }

  // CAS: werkt alleen als de revision nog gelijk is. Geeft het aantal gewijzigde rijen terug.
  updateIfRevision(docKey, expectedRevision, patch, actor, stamp) {
    const result = this.db.prepare(`
      UPDATE authoring_documents
      SET body_json = COALESCE(?, body_json), archived = COALESCE(?, archived), revision = revision + 1, updated_at = ?, updated_by = ?
      WHERE doc_key = ? AND revision = ?
    `).run(
      patch.body ? JSON.stringify(patch.body) : null,
      patch.archived === undefined ? null : (patch.archived ? 1 : 0),
      stamp, actor || null, docKey, expectedRevision
    );
    return Number(result.changes || 0);
  }

  replaceRefs(fromDocKey, refs) {
    this.db.prepare("DELETE FROM authoring_refs WHERE from_doc_key = ?").run(fromDocKey);
    const insert = this.db.prepare("INSERT OR IGNORE INTO authoring_refs (from_doc_key, to_doc_key) VALUES (?, ?)");
    for (const ref of refs) insert.run(fromDocKey, ref);
  }

  activeBacklinks(docKey) {
    return this.db.prepare(`
      SELECT r.from_doc_key AS docKey FROM authoring_refs r
      JOIN authoring_documents d ON d.doc_key = r.from_doc_key
      WHERE r.to_doc_key = ? AND d.archived = 0
      ORDER BY r.from_doc_key
    `).all(docKey).map((row) => row.docKey);
  }

  operation(requestId) {
    return this.db.prepare("SELECT * FROM authoring_operations WHERE request_id = ?").get(requestId) || null;
  }

  recordOperation(requestId, docKey, command, payloadSha, response, actor, stamp) {
    this.db.prepare(`
      INSERT INTO authoring_operations (request_id, doc_key, command, payload_sha256, response_json, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(requestId, docKey, command, payloadSha, JSON.stringify(response), actor || null, stamp);
  }
}
