import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TOKEN_KEY } from '../services/tokenStorage.js';
import { USER, ok, renderApp } from '../test/renderApp.jsx';

const routes = { 'GET /auth/me': ok({ user: USER }) };
const h1 = (name) => screen.findByRole('heading', { level: 1, name });
const openMenu = (user) => user.click(screen.getByRole('button', { name: 'Tài khoản' }));

describe('focus sau khi đổi route', () => {
  it('chuyển focus vào h1 của trang mới, không focus ở lần tải đầu', async () => {
    const { user } = renderApp('/', { token: 'jwt', routes });
    const home = await h1('Xin chào');
    expect(home).not.toHaveFocus();

    await user.click(screen.getByRole('link', { name: /Hồ sơ/ }));
    expect(await h1('Hồ sơ của bạn')).toHaveFocus();
  });

  it('đăng xuất từ menu: focus h1 trang Đăng nhập, thông báo vẫn hiển thị, token bị xóa', async () => {
    const { user } = renderApp('/profile', { token: 'jwt', routes });
    await h1('Hồ sơ của bạn');
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    expect(await h1('Chào mừng trở lại')).toHaveFocus();
    expect(screen.getByText('Bạn đã đăng xuất.')).toBeVisible();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('menu tài khoản (bottom sheet mobile / dropdown desktop)', () => {
  it('mở: focus mục đầu tiên, role menu có tên; Esc đóng và trả focus về nút mở', async () => {
    const { user } = renderApp('/', { token: 'jwt', routes });
    await h1('Xin chào');
    const button = screen.getByRole('button', { name: 'Tài khoản' });
    await user.click(button);

    expect(screen.getByRole('menu', { name: 'Tài khoản' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Trang chủ' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('chạm nền (scrim) đóng menu và trả focus về nút mở', async () => {
    const { user } = renderApp('/', { token: 'jwt', routes });
    await h1('Xin chào');
    await openMenu(user);
    await user.click(screen.getByTestId('account-menu-scrim'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tài khoản' })).toHaveFocus();
  });

  it('Tab xoay vòng trong menu thay vì thoát ra nội dung phía sau', async () => {
    const { user } = renderApp('/', { token: 'jwt', routes });
    await h1('Xin chào');
    await openMenu(user);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('menuitem', { name: 'Trang chủ' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toHaveFocus();
  });
});
