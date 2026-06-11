import { fileURLToPath } from "url";
import { existsSync } from "fs";

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
