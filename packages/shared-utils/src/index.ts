export type EnvReader = Readonly<Record<string, string | undefined>>;

export function readOptionalEnv(env: EnvReader, key: string): string | undefined {
  const value = env[key];
  return value && value.trim().length > 0 ? value : undefined;
}

export function readRequiredEnv(env: EnvReader, key: string): string {
  const value = readOptionalEnv(env, key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function splitCsv(value: string | undefined): readonly string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

