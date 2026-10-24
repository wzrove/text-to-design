/**
 * 错误上报同意(遥测门控)的跨侧契约:UI ↔ daemon 的**旁路帧**(理由同
 * activity / version:不过 MCP、没有外部调用方,不进 `PluginRequest`)。
 *
 * 为什么同意状态由 daemon 保管、而不是像 locale 那样存 code 侧 clientStorage:
 * 上报的执行方与门控必须同一侧 —— daemon 离线攒批、上线补报也要知道用户同没
 * 同意;面板重装也不能把同意弄丢。面板只是遥控:菜单项 → dialog → consent_set。
 */
export interface ConsentSetFrame {
  type: 'consent_set';
  granted: boolean;
}

/**
 * daemon → UI:当前同意状态(面板连上时 / 用户改定后的回执)。
 * `asked` 缺省(旧 daemon)= 已问过,面板不主动弹首问框。
 */
export interface ConsentPushFrame {
  type: 'consent';
  granted: boolean;
  asked?: boolean;
}

export function isConsentSetFrame(value: unknown): value is ConsentSetFrame {
  const m = value as Partial<ConsentSetFrame> | null | undefined;
  return (
    m != null && m.type === 'consent_set' && typeof m.granted === 'boolean'
  );
}

export function isConsentPushFrame(value: unknown): value is ConsentPushFrame {
  const m = value as Partial<ConsentPushFrame> | null | undefined;
  return m != null && m.type === 'consent' && typeof m.granted === 'boolean';
}
