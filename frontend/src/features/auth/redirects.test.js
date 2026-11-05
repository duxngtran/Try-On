import { describe, expect, it } from 'vitest';
import { getGuestOnlyRedirect, getPostLoginPath, isSafeInternalPath } from './redirects.js';

const user = { role: 'user', profileCompleted: true };
const newUser = { role: 'user', profileCompleted: false };
const admin = { role: 'admin', profileCompleted: false };

describe('isSafeInternalPath (chống open redirect)', () => {
  it.each([
    ['/profile', true],
    ['/admin?tab=1#x', true],
    ['//evil.com', false],
    ['https://evil.com', false],
    ['/\\evil.com', false],
    ['/a/https://evil.com', false],
    ['/\t/evil.com', false],
    ['/\n/evil.com', false],
    ['profile', false],
    ['', false],
    ['/login', false],
    ['/register?x=1', false],
    [undefined, false],
    [null, false],
    [{ toString: () => '/profile' }, false],
  ])('%j -> %s', (path, expected) => {
    expect(isSafeInternalPath(path)).toBe(expected);
  });
});

describe('getPostLoginPath (post-login-navigation.md)', () => {
  it('đăng ký luôn vào /profile, bỏ qua from (D-16)', () => {
    expect(getPostLoginPath({ user: newUser, from: '/', source: 'register' })).toBe('/profile');
  });

  it('from hợp lệ và hợp vai thì quay về đó', () => {
    expect(getPostLoginPath({ user, from: '/profile?x=1' })).toBe('/profile?x=1');
    expect(getPostLoginPath({ user: admin, from: '/admin' })).toBe('/admin');
  });

  it('from không an toàn bị bỏ qua, rơi về đích mặc định', () => {
    expect(getPostLoginPath({ user, from: '//evil.com' })).toBe('/');
    expect(getPostLoginPath({ user: newUser, from: 'https://evil.com' })).toBe('/profile');
  });

  it('from không hợp vai bị bỏ qua (tránh vòng lặp login <-> 403)', () => {
    expect(getPostLoginPath({ user, from: '/admin' })).toBe('/');
    expect(getPostLoginPath({ user: admin, from: '/profile' })).toBe('/admin');
  });

  it('đích mặc định theo vai và mức đủ hồ sơ', () => {
    expect(getPostLoginPath({ user: admin })).toBe('/admin');
    expect(getPostLoginPath({ user: newUser })).toBe('/profile');
    expect(getPostLoginPath({ user })).toBe('/');
  });

  it('/admin-tools không bị coi là khu vực admin', () => {
    expect(getPostLoginPath({ user, from: '/admin-tools' })).toBe('/admin-tools');
  });
});

describe('getGuestOnlyRedirect (D-33)', () => {
  it('admin -> /admin, user -> /', () => {
    expect(getGuestOnlyRedirect(admin)).toBe('/admin');
    expect(getGuestOnlyRedirect(user)).toBe('/');
  });
});
