import { copyFile, mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface GameBibleNodeWriteResult {
  readonly ok: true;
  readonly targetPath: string;
  readonly backupPath: string | null;
  readonly auditAction: "game_bible_node.save";
}

export function getGameBibleNodeJsonPath(): string {
  return resolve(process.env.GK_GAMEBIBLE_NODE_JSON_PATH ?? "/var/www/gk/README/GameBibleNode.json");
}

export function validateGameBibleNodeDocument(document: unknown): asserts document is Record<string, unknown> {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("game_bible_json_object_required");
  }

  const candidate = document as Record<string, unknown>;

  if (typeof candidate.schema !== "string" || !Array.isArray(candidate.nodes)) {
    throw new Error("game_bible_json_contract_invalid");
  }
}

export async function writeGameBibleNodeJsonAtomically(
  document: unknown,
  targetPath = getGameBibleNodeJsonPath()
): Promise<GameBibleNodeWriteResult> {
  validateGameBibleNodeDocument(document);

  const resolvedTarget = resolve(targetPath);
  const targetDir = dirname(resolvedTarget);
  const backupDir = resolve(process.env.GK_GAMEBIBLE_NODE_BACKUP_DIR ?? join(targetDir, ".backups"));
  const lockPath = `${resolvedTarget}.lock`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tempPath = join(targetDir, `.GameBibleNode.json.${process.pid}.${timestamp}.tmp`);
  const backupPath = join(backupDir, `GameBibleNode.json.${timestamp}.bak`);
  const payload = `${JSON.stringify(document, null, 2)}\n`;

  await mkdir(backupDir, { recursive: true });

  const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new Error("game_bible_save_locked");
    }

    throw error;
  });

  try {
    await copyFile(resolvedTarget, backupPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });

    const temp = await open(tempPath, "wx");
    try {
      await temp.writeFile(payload, "utf8");
      await temp.sync();
    } finally {
      await temp.close();
    }

    await rename(tempPath, resolvedTarget);

    const dirHandle = await open(targetDir, "r").catch(() => null);
    try {
      await dirHandle?.sync();
    } finally {
      await dirHandle?.close();
    }

    await writeAuditLine({
      action: "game_bible_node.save",
      targetPath: resolvedTarget,
      backupPath
    });

    return {
      ok: true,
      targetPath: resolvedTarget,
      backupPath,
      auditAction: "game_bible_node.save"
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function writeAuditLine(event: Record<string, unknown>): Promise<void> {
  const auditPath = process.env.GK_GAMEBIBLE_NODE_AUDIT_LOG;

  if (!auditPath) {
    return;
  }

  const line = `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`;
  await mkdir(dirname(auditPath), { recursive: true });
  await writeFile(auditPath, line, { flag: "a", encoding: "utf8" });
}
