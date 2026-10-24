import type { Context } from 'hono';

/** 结构等价 Workers Hyperdrive 绑定,本地声明即可,不引 workers-types */
export interface Hyperdrive {
  connectionString: string;
}

export interface Env {
  TELEMETRY_API_KEY?: string;
  DATABASE_URL?: string;
  DB?: Hyperdrive;
}

/** Workers 取绑定(c.env),Node/Bun 取 process.env;c.env 优先 */
export function envOf(c: Context<{ Bindings: Env }>): Env {
  const fromProcess =
    typeof process !== 'undefined' ? (process.env as unknown as Env) : {};
  return { ...fromProcess, ...c.env };
}
