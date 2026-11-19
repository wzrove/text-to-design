#!/usr/bin/env node
/**
 * commit-msg hook:把工具的默认署名替换成仓库自定义的 Co-Authored-By。
 *
 * 为什么放在 git 层而不是 settings.json:`includeCoAuthoredBy` 只接受布尔值,
 * 不支持自定义字符串;而模型生成的 trailer 每次都可能不同。hook 是唯一能
 * 保证「无论上游写什么,落库的署名都一致」的位置。
 *
 * 只动 Claude 默认署名(Claude / Claude Code),**保留其它人真实的共同作者**。
 *
 * 自定义:
 *   git config coauthor.trailer "Co-Authored-By: Name <you@example.com>"
 * 未配置时用下面的默认值。GitHub 只认 Name <email> 且 email 需绑定账号,
 * 纯装饰文字不会生成共同作者链接。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_TRAILER = 'Co-Authored-By: 🤖 And I Helped!';

function configuredTrailer() {
  try {
    return (
      execFileSync('git', ['config', '--get', 'coauthor.trailer'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || ''
    );
  } catch {
    return '';
  }
}

const file = process.argv[2];
if (!file) {
  console.error('usage: coauthor-trailer.mjs <commit-msg-file>');
  process.exit(2);
}

const trailer = configuredTrailer() || DEFAULT_TRAILER;
const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const kept = source
  .split('\n')
  // 工具的默认署名(模型侧可能写成 Claude 或 Claude Code)
  .filter((line) => !/^co-authored-by:\s*claude(?:\s+code)?\b/i.test(line))
  // 已经写过目标署名:先摘掉,统一补到末尾,避免重复
  .filter((line) => line.trim() !== trailer);

const body = kept.join('\n').replace(/\s+$/, '');
const last = body.split('\n').at(-1) ?? '';
const lastIsTrailer = /^[A-Za-z][A-Za-z-]*:\s/.test(last);
writeFileSync(file, `${body}${lastIsTrailer ? '\n' : '\n\n'}${trailer}\n`);
