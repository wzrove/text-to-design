import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { type BatchCall, batchCallSchema } from 'text-to-design-shared';
import { MAX_CALLS_FILE_BYTES } from '../config';
import { log } from '../logger';

/**
 * `jsd_batch` 的步骤清单文件。
 *
 * 为什么要有这条路:入参里最占地方的是 id 数组(整页铺 token 时一份 bindings
 * 上千个 node id)。把这份 JSON 放文件、调用方只传路径,id 就**不进上下文** ——
 * 模型不必逐字转写上千个 id(转写错一个就是静默漏改),也不吃回显预算。
 *
 * 契约故意做得和 `calls` 一样:文件内容是 `{"calls":[…]}`(可带 stopOnError /
 * checkDrift)或直接一个数组,两种形状等价。多一条形状就多一份事实要维护。
 *
 * 读文件 = 把磁盘内容当参数用,所以:只收绝对路径、只收 JSON、有体积上限、
 * 失败一律点名(路径 / 体积 / 第几步 / 哪个字段错),不截断不猜。
 */
export type BatchCallsFile = {
  calls: BatchCall[];
  stopOnError?: boolean;
  checkDrift?: boolean;
  /** 回显用:本次清单来自哪个文件 */
  path: string;
};

function fail(msg: string): never {
  throw new Error(msg);
}

/** 步骤数上限与 calls 内联形态一致(50):文件省的是参数体积,不是步骤数预算 */
const MAX_STEPS = 50;

export async function loadBatchCallsFile(
  input: string,
): Promise<BatchCallsFile> {
  const path = input.trim();
  if (path === '') fail('callsFile 是空路径。请给步骤清单 JSON 的绝对路径。');
  if (!isAbsolute(path))
    fail(
      `callsFile 必须是绝对路径(收到「${path}」)。daemon 是常驻进程,相对路径会解析到它自己的工作目录而不是你的项目 —— 所以这里不做推断,请写全路径。`,
    );

  const tooBig = (size: number): never =>
    fail(
      `callsFile「${path}」${(size / 1024 / 1024).toFixed(2)} MB,超过上限 ${(
        MAX_CALLS_FILE_BYTES / 1024 / 1024
      ).toFixed(
        0,
      )} MB(可用 TEXT_TO_DESIGN_MCP_MAX_CALLS_FILE_BYTES 覆盖)。请把清单拆成多份分开调用。`,
    );

  const info = await stat(path).catch((e: unknown) => {
    fail(
      `读不到 callsFile「${path}」:${e instanceof Error ? e.message : String(e)}。路径写错了,或文件还没生成。`,
    );
  });
  if (!info.isFile()) fail(`callsFile「${path}」不是文件(是目录或特殊文件)。`);
  if (info.size > MAX_CALLS_FILE_BYTES) tooBig(info.size);

  // 按字节读再解码:readFile(...,'utf8') 会把 BOM 留成 U+FEFF 让 JSON.parse 失败
  // (Windows PowerShell 5.1 的 UTF8 / Out-File 默认就带 BOM / UTF-16LE),
  // 也会把 UTF-16 读成一串 NUL。这里显式识别三种 BOM,超限用实际字节数复核。
  const buf = await readFile(path).catch((e: unknown) => {
    fail(
      `读 callsFile「${path}」失败:${e instanceof Error ? e.message : String(e)}。`,
    );
  });
  if (buf.length > MAX_CALLS_FILE_BYTES) tooBig(buf.length);
  let raw: string;
  if (
    buf.length >= 4 &&
    ((buf[0] === 0xff &&
      buf[1] === 0xfe &&
      buf[2] === 0x00 &&
      buf[3] === 0x00) ||
      (buf[0] === 0x00 &&
        buf[1] === 0x00 &&
        buf[2] === 0xfe &&
        buf[3] === 0xff))
  ) {
    fail(
      `callsFile「${path}」是 UTF-32 编码(4 字节 BOM),不支持;请另存为 UTF-8(带不带 BOM 均可)。`,
    );
  } else if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    raw = buf.subarray(3).toString('utf8');
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    raw = buf.subarray(2).toString('utf16le');
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    fail(
      `callsFile「${path}」是 UTF-16BE 编码,BOM 已识别但 Node 无对应解码;请另存为 UTF-8(带不带 BOM 均可)。`,
    );
  } else {
    raw = buf.toString('utf8');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(
      `callsFile「${path}」不是合法 JSON:${e instanceof Error ? e.message : String(e)}。文件内容应为 {"calls":[…]} 或直接一个数组。`,
    );
  }

  const holder = Array.isArray(parsed)
    ? { calls: parsed }
    : (parsed as Record<string, unknown>);
  if (holder == null || typeof holder !== 'object')
    fail(
      `callsFile「${path}」的顶层既不是数组也不是对象。两种合法形状:直接给步骤数组,或给 {"calls":[…]}。`,
    );

  const calls = holder.calls;
  if (!Array.isArray(calls))
    fail(
      `callsFile「${path}」里没有 calls 数组(实际类型 ${calls === undefined ? 'undefined' : typeof calls})。文件内容应为 {"calls":[…]} 或直接一个数组。`,
    );
  if (calls.length === 0)
    fail(`callsFile「${path}」的 calls 是空数组,没有步骤可执行。`);
  if (calls.length > MAX_STEPS)
    fail(
      `callsFile「${path}」有 ${calls.length} 步,超过单批上限 ${MAX_STEPS} 步。文件省的是参数体积、不是步骤数预算 —— 请拆成多份清单分开调用(整页改造按块切批还能换来回显清晰与失败隔离)。`,
    );

  const checked: BatchCall[] = [];
  for (const [i, c] of calls.entries()) {
    const r = batchCallSchema.safeParse(c);
    if (!r.success) {
      const detail = r.error.issues
        .map((it) => `${it.path.join('.') || '(root)'}: ${it.message}`)
        .join('; ');
      fail(`callsFile「${path}」第 ${i + 1} 步形状不对:${detail}`);
    }
    checked.push(r.data);
  }

  for (const key of ['stopOnError', 'checkDrift'] as const) {
    const value = holder[key];
    if (value !== undefined && typeof value !== 'boolean')
      fail(
        `callsFile「${path}」的 ${key} 必须是布尔值(收到 ${typeof value}:${String(
          value,
        ).slice(
          0,
          40,
        )})。写错类型会被当成没写,失败策略与漂移复核就和预期不一致。`,
      );
  }
  const stopOnError =
    typeof holder.stopOnError === 'boolean' ? holder.stopOnError : undefined;
  const checkDrift =
    typeof holder.checkDrift === 'boolean' ? holder.checkDrift : undefined;

  // 读盘这件事留在日志里:出问题时能回答「这次到底读了哪个文件」
  log(
    `jsd_batch 从文件读入步骤清单:${path}(${checked.length} 步${stopOnError === false ? ',stopOnError=false' : ''})`,
  );

  return { calls: checked, stopOnError, checkDrift, path };
}
