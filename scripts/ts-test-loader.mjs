import { readFile } from "node:fs/promises";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.endsWith(".js") &&
    context.parentURL &&
    context.parentURL.endsWith(".ts")
  ) {
    const tsSpecifier = specifier.slice(0, -3) + ".ts";
    const resolved = new URL(tsSpecifier, context.parentURL);
    if (existsSync(fileURLToPath(resolved))) {
      return nextResolve(tsSpecifier, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        sourceMap: false
      },
      fileName: fileURLToPath(url)
    });

    return {
      format: "module",
      shortCircuit: true,
      source: output.outputText
    };
  }

  return nextLoad(url, context);
}
