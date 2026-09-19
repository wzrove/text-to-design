import { describe, expect, it } from 'vitest';
import {
  CONFIRM_STALE_MS,
  HEARTBEAT_MS,
  isConfirmExpired,
} from '../connection';

/**
 * 半开连接检测判据:daemon 每个心跳周期重发一次 ready,
 * 连续两个周期收不到才算过期(单周期抖动不误判)。
 */
describe('isConfirmExpired', () => {
  it('阈值 = 两个心跳周期', () => {
    expect(CONFIRM_STALE_MS).toBe(2 * HEARTBEAT_MS);
  });

  it('未到阈值不算过期', () => {
    expect(isConfirmExpired(1000, 1000 + CONFIRM_STALE_MS - 1)).toBe(false);
  });

  it('到达阈值即过期', () => {
    expect(isConfirmExpired(1000, 1000 + CONFIRM_STALE_MS)).toBe(true);
  });
});
