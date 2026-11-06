import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { ADMIN, USER, fail, makeCart, ok, renderApp } from '../../test/renderApp.jsx';

const STATE = {
  profile: { completed: true, missing: [] },
  consent: {
    accepted: true,
    acceptedAt: '2026-11-06T02:00:00.000Z',
    version: 1,
    requiredVersion: 1,
    withdrawnAt: null,
  },
  quota: {
    dailyLimit: 20,
    dailyUsed: 3,
    dailyResetsAt: '2026-11-06T17:00:00.000Z',
    monthlyLimit: 100,
    monthlyUsed: 12,
    monthlyResetsAt: '2026-11-30T17:00:00.000Z',
    held: 0,
    remaining: 16,
  },
  generation: { available: true, prefetchAllowed: false },
};
const IMAGE = {
  url: 'https://storage.test/tryon.jpg?token=x',
  expiresAt: '2099-01-01T00:00:00.000Z',
  width: 864,
  height: 1296,
};
const product = (n) => ({
  id: `p${n}`,
  name: `Áo ${n}`,
  priceVnd: 100000 + n,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: `https://storage.test/p${n}.jpg`, version: 1 },
  position: n,
});
const line = (n, quantity = 1, extra = {}) => ({
  productId: `p${n}`,
  name: `Áo ${n}`,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: `https://storage.test/p${n}.jpg`, version: 1 },
  quantity,
  priceVnd: 100000 + n,
  lineTotalVnd: (100000 + n) * quantity,
  priceChangedFrom: null,
  available: true,
  ...extra,
});
const readyResults = Object.fromEntries(
  [1, 2, 3].map((n) => [`GET /try-on/products/p${n}/result`, ok({ state: 'ready', image: IMAGE })]),
);

const renderRoom = (routes = {}, { user = USER, path = '/try-on?category=c1' } = {}) =>
  renderApp(path, {
    token: 'jwt',
    routes: {
      'GET /auth/me': ok({ user }),
      'GET /try-on/state': ok(STATE),
      'GET /try-on/categories': ok({
        categories: [{ id: 'c1', name: 'Áo thun', productCount: 3 }],
      }),
      'GET /try-on/categories/c1/products': ok({
        items: [1, 2, 3].map(product),
        total: 3,
        prevCursor: null,
        nextCursor: null,
      }),
      ...readyResults,
      ...routes,
    },
  });

const addButton = () => screen.findByRole('button', { name: 'Thêm vào giỏ' });
const productHeading = (name) => screen.findByRole('heading', { level: 2, name });
const calls = (all, key) => all.filter((c) => c.key === key);
const postsToCart = (all) => calls(all, 'POST /cart/items');
const jobPosts = (all) =>
  all.filter((c) => c.key.startsWith('POST /try-on') && c.key.endsWith('/jobs'));
const headerCart = () => screen.getByRole('img', { name: /^Giỏ hàng/ });

/** Một response giữ lại cho tới khi test gọi `release`. */
function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('thêm vào giỏ ở phòng thử đồ (AC-01, AC-02)', () => {
  it('bấm: gửi đúng một request với productId, số trên header tăng, thông báo nêu tên, ở lại sản phẩm, không tạo job', async () => {
    const {
      user,
      calls: all,
      router,
    } = renderRoom({
      'POST /cart/items': () => ok(makeCart([line(1)])),
    });
    await productHeading('Áo 1');
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, trống');

    await user.click(await addButton());

    expect(await screen.findByText('Đã thêm Áo 1 vào giỏ.')).toBeInTheDocument();
    expect(postsToCart(all)).toHaveLength(1);
    expect(postsToCart(all)[0].body).toEqual({ productId: 'p1' });
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 1 món');
    expect(await screen.findByText('Trong giỏ: 1')).toBeInTheDocument();
    expect(await addButton()).toHaveAccessibleDescription('Trong giỏ: 1');
    expect(router.state.location.pathname).toBe('/try-on');
    expect(router.state.location.search).toBe('?category=c1&product=p1');
    expect(screen.getByAltText('Ảnh bạn mặc Áo 1, do AI tạo')).toBeInTheDocument();
    expect(jobPosts(all)).toHaveLength(0);
    expect(all.some((c) => c.key.startsWith('GET /try-on/jobs'))).toBe(false);
  });

  it.each([
    ['ảnh đang chờ', { state: 'pending', job: { id: 'j1', status: 'running' } }],
    ['ảnh lỗi', { state: 'failed', errorCode: 'TRYON_FAILED' }],
    ['bị chặn', { state: 'blocked', errorCode: 'TRYON_BLOCKED' }],
  ])('%s: nút vẫn bấm được và thêm thành công', async (_label, result) => {
    const { user, calls: all } = renderRoom({
      'GET /try-on/products/p1/result': ok(result),
      'GET /try-on/jobs/j1': ok({ job: { id: 'j1', status: 'running' } }),
      'POST /cart/items': () => ok(makeCart([line(1)])),
    });
    await productHeading('Áo 1');
    const button = await addButton();
    expect(button).not.toHaveAttribute('aria-disabled');
    await user.click(button);
    expect(await screen.findByText('Đã thêm Áo 1 vào giỏ.')).toBeInTheDocument();
    expect(jobPosts(all)).toHaveLength(0);
  });

  it('hết lượt và tạm dừng tạo ảnh: nút vẫn bấm được', async () => {
    const { user } = renderRoom({
      'GET /try-on/state': ok({
        ...STATE,
        quota: { ...STATE.quota, remaining: 0, held: 0, dailyUsed: 20 },
        generation: { available: false, prefetchAllowed: false },
      }),
      'POST /cart/items': () => ok(makeCart([line(1)])),
    });
    await productHeading('Áo 1');
    await user.click(await addButton());
    expect(await screen.findByText('Đã thêm Áo 1 vào giỏ.')).toBeInTheDocument();
  });

  it('poll job của ảnh đang chờ không dừng vì thêm giỏ, và thêm giỏ không tạo thêm job nào', async () => {
    const { user, calls: all } = renderRoom({
      'GET /try-on/products/p1/result': ok({
        state: 'pending',
        job: { id: 'j1', status: 'running' },
      }),
      'GET /try-on/jobs/j1': ok({ job: { id: 'j1', status: 'running' } }),
      'POST /try-on/products/p1/jobs': ok(
        { state: 'pending', job: { id: 'j1', status: 'running' } },
        202,
      ),
      'POST /cart/items': () => ok(makeCart([line(1)])),
    });
    await productHeading('Áo 1');
    await screen.findByText('Đang tạo ảnh bạn mặc sản phẩm này…');
    // Phòng tự POST job hiển thị một lần khi ảnh chưa có (D-136); đợi nó xong rồi mới đo.
    await waitFor(() => expect(jobPosts(all)).toHaveLength(1));
    await user.click(await addButton());
    await screen.findByText('Đã thêm Áo 1 vào giỏ.');
    const before = calls(all, 'GET /try-on/jobs/j1').length;
    await waitFor(() => expect(calls(all, 'GET /try-on/jobs/j1').length).toBeGreaterThan(before), {
      timeout: 5000,
    });
    expect(screen.getByText('Đang tạo ảnh bạn mặc sản phẩm này…')).toBeInTheDocument();
    expect(jobPosts(all)).toHaveLength(1); // vẫn đúng một POST của phòng, giỏ không thêm job
  }, 10000);
});

describe('khóa theo từng sản phẩm và đúng sản phẩm (AC-05, AC-06, D-160)', () => {
  it('bấm đúp: một request; nút aria-busy, không disabled, vẫn giữ focus', async () => {
    const gate = deferred();
    const { user, calls: all } = renderRoom({ 'POST /cart/items': () => gate.promise });
    await productHeading('Áo 1');
    const button = await addButton();
    button.focus();
    await user.dblClick(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent('Đang thêm…');
    expect(postsToCart(all)).toHaveLength(1);

    await act(async () => gate.release(ok(makeCart([line(1)]))));
    await screen.findByText('Đã thêm Áo 1 vào giỏ.');
    expect(button).not.toHaveAttribute('aria-busy');
    expect(postsToCart(all)).toHaveLength(1);
  });

  it('chuyển sang sản phẩm khác khi request đang chạy: giỏ có P1, thông báo ghi tên P1, màn hình vẫn là P2', async () => {
    const gate = deferred();
    const { user, calls: all } = renderRoom({
      'POST /cart/items': () => gate.promise,
    });
    await productHeading('Áo 1');
    await user.click(await addButton());
    await waitFor(() => expect(postsToCart(all)).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');
    // Nút của sản phẩm mới ở trạng thái mặc định: khóa theo từng sản phẩm, không khóa toàn cục.
    const next = await addButton();
    expect(next).not.toHaveAttribute('aria-busy');
    expect(next).not.toHaveAttribute('aria-disabled');

    await act(async () => gate.release(ok(makeCart([line(1)]))));
    expect(await screen.findByText('Đã thêm Áo 1 vào giỏ.')).toBeInTheDocument();
    expect(postsToCart(all)[0].body).toEqual({ productId: 'p1' });
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 2' })).toBeInTheDocument();
    expect(screen.queryByText(/Trong giỏ/)).not.toBeInTheDocument(); // P2 chưa có trong giỏ
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 1 món');

    // Quay lại P1 khi request đã xong: ghi chú của P1 hiện số trong giỏ.
    await user.click(screen.getByRole('button', { name: 'Sản phẩm trước' }));
    await productHeading('Áo 1');
    expect(await screen.findByText('Trong giỏ: 1')).toBeInTheDocument();
    expect(postsToCart(all)).toHaveLength(1);
  });

  it('quay lại sản phẩm cũ khi request còn chạy: nút lại hiện "Đang thêm…"', async () => {
    const gate = deferred();
    const { user } = renderRoom({ 'POST /cart/items': () => gate.promise });
    await productHeading('Áo 1');
    await user.click(await addButton());
    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');
    await user.click(screen.getByRole('button', { name: 'Sản phẩm trước' }));
    await productHeading('Áo 1');
    // Đang gửi thì tên nút đổi thành "Đang thêm…", nên tìm bằng thuộc tính của nút.
    await waitFor(() =>
      expect(document.querySelector('[data-cart-add]')).toHaveAttribute('aria-busy', 'true'),
    );
    await act(async () => gate.release(ok(makeCart([line(1)]))));
  });

  it('hai sản phẩm thêm chồng nhau: sau khi hết request đọc lại giỏ đúng một lần', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const { user, calls: all } = renderRoom({
      'POST /cart/items': () => queue.shift().promise,
      'GET /cart': () => ok(makeCart([line(2), line(1)])),
    });
    await productHeading('Áo 1');
    await user.click(await addButton());
    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');
    await user.click(await addButton());
    const getsBefore = calls(all, 'GET /cart').length;

    await act(async () => first.release(ok(makeCart([line(1)]))));
    expect(calls(all, 'GET /cart')).toHaveLength(getsBefore); // còn một request đang chạy
    await act(async () => second.release(ok(makeCart([line(2), line(1)]))));
    await waitFor(() => expect(calls(all, 'GET /cart')).toHaveLength(getsBefore + 1));
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 2 món');
  });

  it('giá trên màn hình đã cũ: vẫn thêm được và thông báo giá hiện tại (AC-11)', async () => {
    const { user } = renderRoom({
      'POST /cart/items': () =>
        ok(
          makeCart([
            line(1, 1, { priceVnd: 150000, lineTotalVnd: 150000, priceChangedFrom: 100001 }),
          ]),
        ),
    });
    await productHeading('Áo 1');
    await user.click(await addButton());
    expect(
      await screen.findByText(/Đã thêm Áo 1 vào giỏ\. Giá hiện tại: 150\.000/),
    ).toBeInTheDocument();
  });
});

describe('lỗi theo mã (US-07 E1 → E5, D-119)', () => {
  const failing = (response) => ({ 'POST /cart/items': () => response });
  const SERVER_TEXT = 'Lỗi SQL nội bộ không được lộ ra';

  it.each([
    ['404', fail(404, 'NOT_FOUND', SERVER_TEXT), 'Sản phẩm này không còn bán.', 'warning'],
    [
      '409 giới hạn số lượng, số lấy từ details',
      fail(409, 'CART_QUANTITY_LIMIT', SERVER_TEXT, { maxQuantity: 7 }),
      'Mỗi sản phẩm chỉ đặt tối đa 7 món.',
      'warning',
    ],
    [
      '409 giỏ đầy, số lấy từ details',
      fail(409, 'CART_FULL', SERVER_TEXT, { maxLines: 12 }),
      /Giỏ hàng đã đầy \(tối đa 12 sản phẩm\)\./,
      'warning',
    ],
    [
      '409 giới hạn nhưng thiếu details',
      fail(409, 'CART_QUANTITY_LIMIT', SERVER_TEXT),
      'Mỗi sản phẩm có giới hạn số lượng trong giỏ.',
      'warning',
    ],
    [
      '500',
      fail(500, 'INTERNAL_ERROR', SERVER_TEXT),
      'Chưa thêm được vào giỏ. Vui lòng thử lại.',
      'danger',
    ],
    ['mất mạng', { networkError: true }, 'Chưa thêm được vào giỏ. Vui lòng thử lại.', 'danger'],
    [
      '400 productId',
      fail(400, 'VALIDATION_ERROR', SERVER_TEXT),
      'Chưa thêm được vào giỏ. Vui lòng thử lại.',
      'danger',
    ],
  ])('%s: Alert dưới nút, không lộ chữ của server', async (_label, response, text) => {
    const { user } = renderRoom(failing(response));
    await productHeading('Áo 1');
    await user.click(await addButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(document.body).not.toHaveTextContent(SERVER_TEXT);
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, trống');
  });

  it('500: không tự gửi lại, nút dùng lại được ngay, bấm lại thì Alert cũ biến mất', async () => {
    let attempt = 0;
    const { user, calls: all } = renderRoom({
      'POST /cart/items': () => {
        attempt += 1;
        return attempt === 1 ? fail(500, 'INTERNAL_ERROR') : ok(makeCart([line(1)]));
      },
    });
    await productHeading('Áo 1');
    const button = await addButton();
    await user.click(button);
    await screen.findByRole('alert');
    expect(postsToCart(all)).toHaveLength(1);
    expect(button).not.toHaveAttribute('aria-disabled');

    await user.click(button);
    await screen.findByText('Đã thêm Áo 1 vào giỏ.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(postsToCart(all)).toHaveLength(2);
  });

  it('404: nút khóa mềm (vẫn focus được), không tự chuyển sản phẩm, mở lại ở sản phẩm khác', async () => {
    const { user, router } = renderRoom(failing(fail(404, 'NOT_FOUND')));
    await productHeading('Áo 1');
    const button = await addButton();
    await user.click(button);
    await screen.findByRole('alert');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription('Sản phẩm này không còn bán.');
    expect(router.state.location.search).toBe('?category=c1&product=p1');

    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');
    expect(await addButton()).not.toHaveAttribute('aria-disabled');
  });

  it('429: khóa nút theo retryAfterSeconds, hiển thị đếm ngược, không đọc từng giây', async () => {
    const { user, calls: all } = renderRoom(
      failing(fail(429, 'TOO_MANY_REQUESTS', SERVER_TEXT, { retryAfterSeconds: 30 })),
    );
    await productHeading('Áo 1');
    const button = await addButton();
    await user.click(button);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bạn thao tác quá nhanh, thử lại sau 30 giây.');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Số đếm từng giây nằm trong phần aria-hidden, nên trình đọc màn hình không đọc lại.
    expect(within(alert).getByText(/Còn \d+ giây/)).toHaveAttribute('aria-hidden', 'true');
    await user.click(button);
    expect(postsToCart(all)).toHaveLength(1);
  });

  it('lỗi về muộn khi đã sang sản phẩm khác: thông báo cấp Layout nêu tên sản phẩm đã bấm', async () => {
    const gate = deferred();
    const { user } = renderRoom({ 'POST /cart/items': () => gate.promise });
    await productHeading('Áo 1');
    await user.click(await addButton());
    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');

    await act(async () => gate.release(fail(500, 'INTERNAL_ERROR')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa thêm được Áo 1 vào giỏ. Vui lòng thử lại.',
    );
    // Không dựng lại Alert ở sản phẩm khác: chỉ có một alert, nằm trong thông báo cấp Layout.
    expect(document.querySelector('[data-cart-notice] [role="alert"]')).not.toBeNull();
    expect(await addButton()).not.toHaveAttribute('aria-disabled');
  });
});

describe('giới hạn từ Cart.limits (D-155)', () => {
  it.each([[10], [3]])(
    'đã đạt maxQuantity = %i: nút khóa mềm, câu lấy số từ limits',
    async (max) => {
      const { user, calls: all } = renderRoom({
        'GET /cart': ok(makeCart([line(1, max)], { limits: { maxQuantity: max, maxLines: 30 } })),
      });
      await productHeading('Áo 1');
      const note = `Đã đạt tối đa ${max} món trong giỏ.`;
      expect(await screen.findByText(note)).toBeInTheDocument();
      const button = await addButton();
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(note);
      await user.click(button);
      expect(postsToCart(all)).toHaveLength(0);
    },
  );

  it('chưa đạt giới hạn: nút bấm được, ghi chú "Trong giỏ"', async () => {
    renderRoom({ 'GET /cart': ok(makeCart([line(1, 9)])) });
    await productHeading('Áo 1');
    expect(await screen.findByText('Trong giỏ: 9')).toBeInTheDocument();
    expect(await addButton()).not.toHaveAttribute('aria-disabled');
  });
});

describe('bàn phím (AC-13)', () => {
  it('focus ở nút Thêm vào giỏ, nhấn → : sang sản phẩm kế tiếp và focus ở nút của sản phẩm mới', async () => {
    const { user } = renderRoom();
    await productHeading('Áo 1');
    const first = await addButton();
    first.focus();
    expect(first).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    await productHeading('Áo 2');
    await waitFor(() =>
      expect(document.activeElement).toBe(document.querySelector('[data-cart-add]')),
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(first); // nút mới, không phải nút cũ đã gỡ
    expect(document.activeElement).toHaveAccessibleName('Thêm vào giỏ');
  });

  it('focus ở chỗ khác thì đổi sản phẩm không kéo focus vào nút giỏ', async () => {
    const { user } = renderRoom();
    await productHeading('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }));
    await productHeading('Áo 2');
    expect(document.querySelector('[data-cart-add]')).not.toHaveFocus();
  });

  it('Enter và Space bấm nút (mặc định của <button>), không bị phím tắt chặn', async () => {
    const { user, calls: all } = renderRoom({ 'POST /cart/items': () => ok(makeCart([line(1)])) });
    await productHeading('Áo 1');
    const button = await addButton();
    button.focus();
    await user.keyboard('{Enter}');
    await screen.findByText('Đã thêm Áo 1 vào giỏ.');
    await user.keyboard(' ');
    await waitFor(() => expect(postsToCart(all)).toHaveLength(2));
  });
});

describe('giỏ qua phiên và theo vai (AC-12, E8, R7)', () => {
  it('admin: không gọi API giỏ, không có biểu tượng giỏ', async () => {
    const { calls: all } = renderApp('/admin', {
      token: 'jwt',
      routes: { 'GET /auth/me': ok({ user: ADMIN }), 'GET /admin/ping': ok({ ok: true }) },
    });
    await screen.findByRole('heading', { level: 1, name: 'Khu vực quản trị' });
    expect(all.some((c) => c.key.includes('/cart'))).toBe(false);
    expect(screen.queryByRole('img', { name: /Giỏ hàng/ })).not.toBeInTheDocument();
  });

  it('chưa biết số (đang tải, hoặc tải lỗi): chỉ icon, không badge; có số sau lần thêm thành công', async () => {
    const { user } = renderRoom({
      'GET /cart': { networkError: true },
      'POST /cart/items': () => ok(makeCart([line(1, 2)])),
    });
    await productHeading('Áo 1');
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    await user.click(await addButton());
    await screen.findByText('Đã thêm Áo 1 vào giỏ.');
    expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 2 món');
    expect(within(headerCart()).getByText('2')).toBeInTheDocument();
  });

  it('có dòng ngừng bán: tên truy cập báo, từ 100 món hiện 99+', async () => {
    renderRoom({
      'GET /cart': ok(
        makeCart([line(1, 120), line(2, 1, { available: false, priceVnd: null, lineTotalVnd: 0 })]),
      ),
    });
    await productHeading('Áo 1');
    await waitFor(() =>
      expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 121 món, có sản phẩm không còn bán'),
    );
    expect(within(headerCart()).getByText('99+')).toBeInTheDocument();
  });

  it('giỏ không phụ thuộc hồ sơ, consent: cổng hiện nhưng biểu tượng giỏ vẫn có số (E10, R6)', async () => {
    renderRoom(
      {
        'GET /try-on/state': ok({
          ...STATE,
          profile: { completed: false, missing: ['photo'] },
        }),
        'GET /cart': ok(makeCart([line(1, 3)])),
      },
      { user: { ...USER, profileCompleted: false } },
    );
    await screen.findByRole('heading', { level: 2, name: 'Hoàn thiện hồ sơ để bắt đầu thử đồ' });
    await waitFor(() => expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 3 món'));
    expect(screen.queryByRole('button', { name: 'Thêm vào giỏ' })).not.toBeInTheDocument();
  });

  it('đăng xuất rồi đăng nhập người khác: không thấy giỏ cũ', async () => {
    const { user } = renderRoom({
      'GET /cart': ok(makeCart([line(1, 4)])),
      'POST /auth/login': ok(
        { token: 'jwt2', user: { ...USER, id: 'u2', email: 'b@example.com' } },
        200,
      ),
    });
    await productHeading('Áo 1');
    await waitFor(() => expect(headerCart()).toHaveAccessibleName('Giỏ hàng, 4 món'));

    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    await screen.findByRole('heading', { level: 1, name: 'Chào mừng trở lại' });
    expect(screen.queryByRole('img', { name: /Giỏ hàng/ })).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
});

describe('bố cục và thứ tự DOM (D-159)', () => {
  it('nút nằm ngay dưới giá, trước các thông báo; thứ tự DOM trước khối thông tin không đổi', async () => {
    renderRoom({
      'GET /try-on/state': ok({ ...STATE, quota: { ...STATE.quota, remaining: 3 } }),
    });
    await productHeading('Áo 1');
    const button = await addButton();
    const price = screen.getByText(/100\.001/);
    const quotaNote = screen.getByText(/Bạn còn 3 lượt tạo ảnh/);
    expect(price.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      button.compareDocumentPosition(quotaNote) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Nút là con của khối thông tin, không nằm trong sân khấu (không che mũi tên, vuốt).
    expect(button.closest('.touch-pan-y')).toBeNull();
    const arrows = [
      screen.getByRole('button', { name: 'Sản phẩm trước' }),
      screen.getByRole('button', { name: 'Sản phẩm tiếp theo' }),
    ];
    for (const arrow of arrows) {
      expect(arrow.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('cổng hồ sơ và cổng consent nói việc mua hàng cần các điều kiện này (D-163)', async () => {
    renderRoom({
      'GET /try-on/state': ok({ ...STATE, profile: { completed: false, missing: ['photo'] } }),
    });
    expect(
      await screen.findByText(/Hiện bạn chỉ thêm được sản phẩm vào giỏ ở phòng thử đồ/),
    ).toBeInTheDocument();
  });

  it('cổng consent: nói chưa thể mua hàng nếu không đồng ý (D-163)', async () => {
    renderRoom({
      'GET /try-on/state': ok({
        ...STATE,
        consent: { ...STATE.consent, accepted: false, acceptedAt: null, version: null },
      }),
    });
    expect(
      await screen.findByText(
        /chỉ thêm được sản phẩm vào giỏ ở phòng thử đồ, nên chưa thể mua hàng/,
      ),
    ).toBeInTheDocument();
  });
});
