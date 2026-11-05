import { describe, it, expect } from 'vitest';
import { createLoginLock } from '../src/services/loginLock.js';

const MIN = 60_000;

function setup() {
  let t = 1_000_000;
  const lock = createLoginLock({ maxFails: 5, lockMs: 15 * MIN, now: () => t });
  return { lock, advance: (ms) => (t += ms) };
}
const fail = (lock, email, n) => Array.from({ length: n }, () => lock.registerFail(email));

describe('loginLock', () => {
  it('lần sai thứ 5 mới khóa; từ lần thứ 6 bị chặn với số giây còn lại', () => {
    const { lock } = setup();
    fail(lock, 'a@x.com', 4);
    expect(lock.check('a@x.com').locked).toBe(false);
    lock.registerFail('a@x.com');
    expect(lock.check('a@x.com')).toEqual({ locked: true, retryAfterSeconds: 900 });
  });

  it('hết khóa đúng lúc: còn 1ms vẫn khóa, đúng mốc thì mở và đếm lại từ 0', () => {
    const { lock, advance } = setup();
    fail(lock, 'a@x.com', 5);
    advance(15 * MIN - 1);
    expect(lock.check('a@x.com').locked).toBe(true);
    advance(1);
    expect(lock.check('a@x.com').locked).toBe(false);
    fail(lock, 'a@x.com', 4);
    expect(lock.check('a@x.com').locked).toBe(false);
  });

  it('cửa sổ 15 phút: sai rải rác ngoài cửa sổ không cộng dồn', () => {
    const { lock, advance } = setup();
    fail(lock, 'a@x.com', 4);
    advance(15 * MIN);
    fail(lock, 'a@x.com', 4);
    expect(lock.check('a@x.com').locked).toBe(false);
  });

  it('đăng nhập đúng xóa bộ đếm; email khác nhau độc lập', () => {
    const { lock } = setup();
    fail(lock, 'a@x.com', 4);
    lock.clear('a@x.com');
    fail(lock, 'a@x.com', 4);
    expect(lock.check('a@x.com').locked).toBe(false);
    fail(lock, 'b@x.com', 5);
    expect(lock.check('b@x.com').locked).toBe(true);
    expect(lock.check('a@x.com').locked).toBe(false);
  });

  it('sweep dọn entry hết hạn, giữ entry còn hạn', () => {
    const { lock, advance } = setup();
    fail(lock, 'old@x.com', 2);
    advance(10 * MIN);
    fail(lock, 'new@x.com', 2);
    advance(6 * MIN);
    lock.sweep();
    expect(lock.size).toBe(1);
  });
});
