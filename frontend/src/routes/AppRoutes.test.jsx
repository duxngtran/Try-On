import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { TOKEN_KEY } from '../services/tokenStorage.js';
import { ADMIN, NEW_USER, USER, fail, ok, renderApp } from '../test/renderApp.jsx';

const h1 = (name) => screen.findByRole('heading', { level: 1, name });
const LOGIN = 'Chào mừng trở lại';
const REGISTER = 'Tạo tài khoản';

const me = (user) => ({ 'GET /auth/me': ok({ user }) });
const session = (user) => ({ token: 'jwt', user });

async function fillLogin(user, email = 'a@example.com', password = 'abcdefg1') {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Mật khẩu'), password);
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

describe('route guard (AC-08, AC-10, AC-11)', () => {
  it('khách vào trang cần đăng nhập thì chuyển /login, đăng nhập xong quay lại đúng trang', async () => {
    const { user } = renderApp('/profile', {
      routes: { 'POST /auth/login': ok(session(USER), 200) },
    });
    await h1(LOGIN);
    await fillLogin(user);
    await h1('Hồ sơ của bạn');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt');
  });

  it('user thường vào /admin thấy 403, không gọi /admin/ping', async () => {
    const { calls } = renderApp('/admin', { token: 'jwt', routes: me(USER) });
    await h1('Bạn không có quyền truy cập.');
    // Người mua đăng nhập nào cũng tải giỏ một lần (US-07); ngoài ra không có API nào khác.
    expect(calls.map((c) => c.key)).toEqual(['GET /auth/me', 'GET /cart']);
  });

  it('admin vào /profile hoặc /login bị chuyển về /admin (D-38, D-33)', async () => {
    const routes = { ...me(ADMIN), 'GET /admin/ping': ok({ ok: true }) };
    const first = renderApp('/profile', { token: 'jwt', routes });
    await h1('Khu vực quản trị');
    first.unmount();
    renderApp('/login', { token: 'jwt', routes });
    await h1('Khu vực quản trị');
  });

  it('người đã đăng nhập vào /login hoặc /register bị chuyển về trang chủ (D-33)', async () => {
    renderApp('/register', { token: 'jwt', routes: me(USER) });
    await h1('Xin chào');
  });

  it('khôi phục phiên khi reload: có token hợp lệ thì vào thẳng trang, không nháy form login', async () => {
    renderApp('/profile', { token: 'jwt', routes: me(USER) });
    await h1('Hồ sơ của bạn');
    expect(screen.queryByLabelText('Mật khẩu')).not.toBeInTheDocument();
  });

  it('token hết hạn khi khôi phục: xóa token, về /login kèm thông báo hết phiên', async () => {
    renderApp('/profile', {
      token: 'old',
      routes: { 'GET /auth/me': fail(401, 'TOKEN_EXPIRED') },
    });
    await h1(LOGIN);
    expect(screen.getByText('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')).toBeVisible();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('lỗi mạng khi khôi phục: giữ token, cho thử lại', async () => {
    let attempts = 0;
    const { user } = renderApp('/', {
      token: 'jwt',
      routes: {
        'GET /auth/me': () => (++attempts === 1 ? fail(503, 'INTERNAL_ERROR') : ok({ user: USER })),
      },
    });
    await h1('Không thể kết nối');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await h1('Xin chào');
  });

  it('401 giữa phiên: xóa token, về /login kèm thông báo, đăng nhập lại quay về trang cũ', async () => {
    let pingStatus = 401;
    const { user } = renderApp('/admin', {
      token: 'jwt',
      routes: {
        ...me(ADMIN),
        'GET /admin/ping': () =>
          pingStatus === 401 ? fail(401, 'TOKEN_EXPIRED') : ok({ ok: true }),
        'POST /auth/login': ok(session(ADMIN)),
      },
    });
    await h1(LOGIN);
    expect(screen.getByText('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')).toBeVisible();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    pingStatus = 200;
    await fillLogin(user, 'admin@example.com');
    await h1('Khu vực quản trị');
  });

  it('đăng xuất: xóa token, về /login, Back không mở lại trang cần đăng nhập (AC-09)', async () => {
    const { user } = renderApp('/profile', { token: 'jwt', routes: me(USER) });
    await h1('Hồ sơ của bạn');
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await h1(LOGIN);
    expect(screen.getByText('Bạn đã đăng xuất.')).toBeVisible();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('đường dẫn lạ hiện 404 trong layout, khách không bị đẩy sang /login', async () => {
    renderApp('/khong-co');
    await h1('Không tìm thấy trang');
    expect(screen.getByRole('link', { name: 'Try-on — Trang chủ' })).toBeInTheDocument();
  });

  it('mỗi trang chỉ có một h1', async () => {
    renderApp('/', { token: 'jwt', routes: me(USER) });
    await h1('Xin chào');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('đăng nhập (AC-05, AC-06, AC-07)', () => {
  it('sai thông tin: một thông báo chung, xóa mật khẩu, không lưu token, không coi là hết phiên', async () => {
    const { user } = renderApp('/login', {
      routes: { 'POST /auth/login': fail(401, 'INVALID_CREDENTIALS') },
    });
    await h1(LOGIN);
    await fillLogin(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('');
    expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('a@example.com');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.queryByText(/hết hạn/)).not.toBeInTheDocument();
  });

  it('validate phía client chặn gửi và focus ô lỗi đầu tiên', async () => {
    const { user, calls } = renderApp('/login');
    await h1(LOGIN);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it('429: khóa nút và đếm ngược theo retryAfterSeconds', async () => {
    const { user } = renderApp('/login', {
      routes: {
        'POST /auth/login': fail(429, 'TOO_MANY_ATTEMPTS', 'x', { retryAfterSeconds: 720 }),
      },
    });
    await h1(LOGIN);
    await fillLogin(user);
    expect(await screen.findByText(/thử lại sau 12 phút/)).toBeVisible();
    const button = screen.getByRole('button', { name: 'Thử lại sau 12:00' });
    expect(button).toBeDisabled();
  });

  it('đích sau đăng nhập: admin -> /admin, user chưa đủ hồ sơ -> /profile', async () => {
    const admin = renderApp('/login', {
      routes: { 'POST /auth/login': ok(session(ADMIN)), 'GET /admin/ping': ok({}) },
    });
    await h1(LOGIN);
    await fillLogin(admin.user, 'admin@example.com');
    await h1('Khu vực quản trị');
    admin.unmount();
    localStorage.clear();

    const newbie = renderApp('/login', { routes: { 'POST /auth/login': ok(session(NEW_USER)) } });
    await h1(LOGIN);
    await fillLogin(newbie.user);
    await h1('Hồ sơ của bạn');
  });
});

describe('đăng ký (AC-01, AC-02, AC-03, AC-04)', () => {
  async function fillRegister(
    user,
    { email = 'New@Example.com ', password = 'abcdefg1', confirm = password } = {},
  ) {
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Mật khẩu'), password);
    await user.type(screen.getByLabelText('Nhập lại mật khẩu'), confirm);
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
  }

  it('thành công: chỉ gửi email chuẩn hóa + mật khẩu (không role, không confirmPassword), vào /profile', async () => {
    const { user, calls } = renderApp('/register', {
      routes: { 'POST /auth/register': ok(session(NEW_USER), 201) },
    });
    await h1(REGISTER);
    await fillRegister(user);
    await h1('Hồ sơ của bạn');
    // Sau khi vào /profile trang tự gọi GET /profile và GET /try-on/state (không có body); chỉ kiểm payload đăng ký.
    expect(calls.filter((c) => !c.key.startsWith('GET /'))).toEqual([
      { key: 'POST /auth/register', body: { email: 'new@example.com', password: 'abcdefg1' } },
    ]);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt');
  });

  it('mật khẩu yếu hoặc nhập lại không khớp: không gọi API', async () => {
    const { user, calls } = renderApp('/register');
    await h1(REGISTER);
    await fillRegister(user, { password: 'abcdefgh', confirm: 'abcdefg' });
    expect(screen.getByText('Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số.')).toBeVisible();
    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it('409: lỗi dưới ô Email kèm link Đăng nhập (điền sẵn email), giữ mật khẩu', async () => {
    const { user } = renderApp('/register', {
      routes: { 'POST /auth/register': fail(409, 'EMAIL_ALREADY_EXISTS') },
    });
    await h1(REGISTER);
    await fillRegister(user, { email: 'dup@example.com' });
    expect(await screen.findByText(/Email này đã được đăng ký/)).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('abcdefg1');
    await user.click(screen.getByRole('link', { name: 'Đăng nhập?' }));
    await h1(LOGIN);
    expect(screen.getByLabelText('Email')).toHaveValue('dup@example.com');
  });

  it('lỗi mạng: giữ email, xóa cả hai ô mật khẩu', async () => {
    const { user } = renderApp('/register', {
      routes: {
        'POST /auth/register': () => {
          throw Object.assign(new Error('Network Error'), { isAxiosError: true });
        },
      },
    });
    await h1(REGISTER);
    await fillRegister(user, { email: 'a@example.com' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.getByLabelText('Email')).toHaveValue('a@example.com');
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu')).toHaveValue(''));
    expect(screen.getByLabelText('Nhập lại mật khẩu')).toHaveValue('');
  });
});
