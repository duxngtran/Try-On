import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { fail, ok, renderApp } from '../../test/renderApp.jsx';
import {
  FP1,
  FP2,
  RECIPIENT,
  baseRoutes,
  cartOf,
  goneLine,
  line,
  orderOf,
} from '../../test/commerceKit.js';
import { formatPriceVnd } from '../cart/cartFormat.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Intl dùng khoảng trắng không ngắt (NBSP); DOM matcher gộp mọi khoảng trắng thành dấu cách.
const price = (value) => formatPriceVnd(value).replace(/\s/g, ' ');
const posts = (calls) => calls.filter((c) => c.key === 'POST /orders');
const NETWORK = { networkError: true };

const field = {
  name: () => screen.findByLabelText(/Họ tên người nhận/),
  phone: () => screen.findByLabelText(/Số điện thoại/),
  address: () => screen.findByLabelText(/Địa chỉ nhận hàng/),
};
const submitButton = () => screen.getByRole('button', { name: /Xác nhận đặt hàng|Thử lại/ });

async function fillForm(user, values = RECIPIENT) {
  await user.type(await field.name(), values.name);
  await user.type(await field.phone(), values.phone);
  await user.type(await field.address(), values.address);
}

const cart1 = () => cartOf([line(1, 2), line(2, 1)], { totalVnd: 848000 });

function open(routes = {}, options = {}) {
  return renderApp(options.path ?? '/checkout', {
    token: 'jwt',
    routes: baseRoutes({
      'GET /cart': ok(cart1()),
      'GET /orders/o1': ok(orderOf()),
      ...routes,
    }),
  });
}

describe('vào trang', () => {
  it('đọc giỏ mới, hiện tóm tắt và tổng tiền đúng như API trả (không tự cộng)', async () => {
    open({ 'GET /cart': ok(cartOf([line(1, 2), line(2, 1)], { totalVnd: 123000 })) });
    await field.name();
    expect(document.querySelector('[data-checkout-total]')).toHaveTextContent(price(123000));
    expect(screen.getByText('Áo 1')).toBeInTheDocument();
  });

  it('giỏ rỗng -> /cart (replace); có dòng ngừng bán -> /cart', async () => {
    const empty = open({ 'GET /cart': ok(cartOf([])) });
    await waitFor(() => expect(empty.router.state.location.pathname).toBe('/cart'));
    empty.unmount();

    const gone = open({ 'GET /cart': ok(cartOf([goneLine(1), line(2)])) });
    await waitFor(() => expect(gone.router.state.location.pathname).toBe('/cart'));
    await screen.findByText(/Có 1 sản phẩm không còn bán/);
  });

  it('GET /cart lỗi: Error state, không có form, không có tổng', async () => {
    open({ 'GET /cart': fail(500, 'INTERNAL_ERROR') });
    await screen.findByText('Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.');
    expect(screen.queryByLabelText(/Họ tên người nhận/)).toBeNull();
    expect(document.querySelector('[data-checkout-total]')).toBeNull();
  });

  it('không làm mới ngầm khi tab hiển thị lại (D-158); cùng thao tác đó ở /cart thì có', async () => {
    const visible = () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const cartPage = open({}, { path: '/cart' });
    await screen.findByText('Áo 1');
    const before = cartPage.calls.filter((c) => c.key === 'GET /cart').length;
    act(visible);
    // Đối chứng dương: ở /cart tab hiển thị lại có làm mới, nên cơ chế kiểm tra này có hiệu lực.
    await waitFor(() =>
      expect(cartPage.calls.filter((c) => c.key === 'GET /cart').length).toBeGreaterThan(before),
    );
    cartPage.unmount();

    const { calls } = open();
    await field.name();
    const loaded = calls.filter((c) => c.key === 'GET /cart').length;
    act(visible);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(calls.filter((c) => c.key === 'GET /cart')).toHaveLength(loaded);
  });
});

describe('validation (AC-16, E9)', () => {
  it('gửi form trống: lỗi dưới từng ô, focus ô đầu tiên, không gửi request', async () => {
    const { user, calls } = open();
    await field.name();
    await user.click(submitButton());
    expect(await screen.findByText('Vui lòng nhập họ tên người nhận (2–100 ký tự).')).toBeVisible();
    expect(screen.getByText('Số điện thoại không hợp lệ.')).toBeVisible();
    expect(screen.getByText('Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự).')).toBeVisible();
    expect(await field.name()).toHaveFocus();
    expect(await field.name()).toHaveAttribute('aria-invalid', 'true');
    expect(posts(calls)).toHaveLength(0);
  });

  it('rời ô số điện thoại: +84 912 345 678 hiện lại thành 0912345678; số sai giữ nguyên và báo lỗi', async () => {
    const { user } = open();
    const phone = await field.phone();
    await user.type(phone, '+84 912 345 678');
    await user.tab();
    expect(phone).toHaveValue('0912345678');
    await user.clear(phone);
    await user.type(phone, '0212345678');
    await user.tab();
    expect(phone).toHaveValue('0212345678');
    expect(await screen.findByText('Số điện thoại không hợp lệ.')).toBeVisible();
  });

  it('lỗi từ server theo field: dùng chữ của thiết kế, không dùng message của server', async () => {
    const { user } = open({
      'POST /orders': fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ (server)', [
        { field: 'recipient.phone', message: 'server nói bậy' },
      ]),
    });
    await fillForm(user);
    await user.click(submitButton());
    expect(await screen.findByText('Số điện thoại không hợp lệ.')).toBeVisible();
    expect(screen.queryByText(/server/)).toBeNull();
    expect(await field.phone()).toHaveFocus();
  });
});

describe('đặt hàng thành công', () => {
  it('chỉ gửi khóa, fingerprint, recipient; khóa là UUID v4 không dùng randomUUID; về /orders/:id bằng replace với banner', async () => {
    const spy = vi.spyOn(crypto, 'randomUUID');
    const { user, calls, router } = open({ 'POST /orders': ok(orderOf(), 201) });
    await fillForm(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));

    const [post] = posts(calls);
    expect(Object.keys(post.body).sort()).toEqual([
      'cartFingerprint',
      'idempotencyKey',
      'recipient',
    ]);
    expect(post.body.cartFingerprint).toBe(FP1);
    expect(post.body.idempotencyKey).toMatch(UUID);
    expect(post.body.recipient).toEqual(RECIPIENT);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    expect(router.state.historyAction).toBe('REPLACE'); // Back không về lại form
    expect(await screen.findByText('Đã ghi nhận đơn hàng DH000123.')).toBeInTheDocument();
  });

  it('không có họ tên, số điện thoại, địa chỉ trong localStorage, sessionStorage (R9, AC-17)', async () => {
    const { user, router } = open({ 'POST /orders': ok(orderOf(), 201) });
    await fillForm(user);
    const everything = () =>
      JSON.stringify([
        ...Object.entries(localStorage),
        ...Object.entries(sessionStorage),
        window.location.href,
      ]);
    expect(everything()).not.toContain('0912345678');
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    for (const secret of [RECIPIENT.name, RECIPIENT.phone, 'Lê Lợi']) {
      expect(everything()).not.toContain(secret);
    }
    expect(JSON.stringify(router.state.location)).not.toContain(RECIPIENT.phone);
  });
});

describe('giỏ đổi giữa lúc đặt (AC-06, E6)', () => {
  it('409 CART_CHANGED: ở lại, giữ form, tải lại tóm tắt, KHÔNG tự gửi lại; xác nhận lần nữa dùng fingerprint mới và cùng khóa', async () => {
    let changed = false;
    let seen;
    const { user, calls, router } = open({
      'GET /cart': () =>
        ok(
          changed
            ? cartOf([line(1, 2, { priceVnd: 150000, lineTotalVnd: 300000 }), line(2, 1)], {
                totalVnd: 999000,
                fingerprint: FP2,
              })
            : cart1(),
        ),
      'POST /orders': (body) => {
        seen = body;
        if (!changed) {
          changed = true;
          return fail(409, 'CART_CHANGED');
        }
        return ok(orderOf(), 201);
      },
    });
    await fillForm(user);
    await user.click(submitButton());

    const alert = await screen.findByText('Giỏ hàng vừa thay đổi');
    expect(alert.closest('[role="alert"]')).toHaveFocus();
    expect(screen.getByText('Vui lòng kiểm tra lại rồi xác nhận.')).toBeInTheDocument();
    expect(
      screen.getByText(`Tổng tiền: ${price(848000)} → ${price(999000)}`, { exact: false }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-checkout-total]')).toHaveTextContent(price(999000));
    expect(screen.getByText('Đã thay đổi')).toBeInTheDocument();
    // Form còn nguyên.
    expect(await field.name()).toHaveValue(RECIPIENT.name);
    expect(await field.phone()).toHaveValue(RECIPIENT.phone);
    expect(await field.address()).toHaveValue(RECIPIENT.address);
    // Chỉ có đúng một POST: đã đợi tới khi cảnh báo hiện (sau khi GET /cart mới về), không có gì tự gửi lại.
    expect(posts(calls)).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/checkout');
    const firstKey = posts(calls)[0].body.idempotencyKey;

    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    expect(posts(calls)).toHaveLength(2);
    expect(seen.cartFingerprint).toBe(FP2);
    expect(seen.idempotencyKey).toBe(firstKey);
  });

  it('sau CART_CHANGED mà giỏ đã rỗng -> khối "Giỏ hàng đang trống" kèm link Đơn của tôi', async () => {
    let changed = false;
    const { user } = open({
      'GET /cart': () => ok(changed ? cartOf([]) : cart1()),
      'POST /orders': () => {
        changed = true;
        return fail(409, 'CART_CHANGED');
      },
    });
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByText(/Giỏ hàng đang trống\. Nếu bạn vừa đặt hàng/);
    expect(screen.getByRole('link', { name: 'Xem Đơn của tôi' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(screen.queryByLabelText(/Họ tên người nhận/)).toBeNull();
  });

  it('sau CART_CHANGED mà giỏ có dòng ngừng bán -> chuyển /cart', async () => {
    let changed = false;
    const { user, router } = open({
      'GET /cart': () => ok(changed ? cartOf([goneLine(1), line(2)]) : cart1()),
      'POST /orders': () => {
        changed = true;
        return fail(409, 'CART_CHANGED');
      },
    });
    await fillForm(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
  });
});

describe('mất response, lỗi server, đặt trùng (AC-11, AC-12, E4, E7, E11)', () => {
  it('mất mạng: "Chưa rõ đơn đã được ghi hay chưa"; Thử lại dùng CÙNG khóa và chuyển tới đơn', async () => {
    let attempt = 0;
    const { user, calls, router } = open({
      'POST /orders': () => {
        attempt += 1;
        return attempt === 1 ? NETWORK : ok(orderOf(), 200); // lần hai: server trả đơn đã có (200)
      },
    });
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByText(/Chưa rõ đơn đã được ghi hay chưa/);
    expect(screen.getByRole('link', { name: 'Xem Đơn của tôi' })).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    expect(retry).toBeInTheDocument();

    await user.click(retry);
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    const keys = posts(calls).map((c) => c.body.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(UUID);
  });

  it('500: thông báo chung, giữ form, thử lại cùng khóa', async () => {
    let attempt = 0;
    const { user, calls, router } = open({
      'POST /orders': () => {
        attempt += 1;
        return attempt === 1 ? fail(500, 'INTERNAL_ERROR') : ok(orderOf(), 201);
      },
    });
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByText('Chưa đặt được hàng. Vui lòng thử lại.');
    expect(await field.phone()).toHaveValue(RECIPIENT.phone);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    const keys = posts(calls).map((c) => c.body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('409 CART_EMPTY (hai tab): thay form bằng khối thông báo và link Xem Đơn của tôi', async () => {
    const { user } = open({ 'POST /orders': fail(409, 'CART_EMPTY') });
    await fillForm(user);
    await user.click(submitButton());
    const block = await screen.findByText(/Giỏ hàng đang trống\. Nếu bạn vừa đặt hàng/);
    expect(block.closest('[role="alert"]')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Xem Đơn của tôi' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(screen.getByRole('link', { name: 'Về giỏ hàng' })).toHaveAttribute('href', '/cart');
    expect(screen.queryByLabelText(/Họ tên người nhận/)).toBeNull();
  });

  it('409 CART_HAS_UNAVAILABLE: về /cart; quay lại /checkout form còn nguyên và dùng lại cùng khóa', async () => {
    let unavailable = false;
    let attempts = 0;
    const { user, calls, router } = open({
      'GET /cart': () => ok(unavailable ? cartOf([goneLine(1), line(2)]) : cart1()),
      'POST /orders': () => {
        attempts += 1;
        if (attempts === 1) {
          unavailable = true;
          return fail(409, 'CART_HAS_UNAVAILABLE');
        }
        return ok(orderOf(), 201);
      },
    });
    await fillForm(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
    await screen.findByText(/Có 1 sản phẩm không còn bán/);

    unavailable = false; // người mua đã bỏ dòng ngừng bán
    await act(async () => {
      await router.navigate('/checkout');
    });
    expect(await field.name()).toHaveValue(RECIPIENT.name);
    expect(await field.phone()).toHaveValue(RECIPIENT.phone);
    expect(await field.address()).toHaveValue(RECIPIENT.address);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    const keys = posts(calls).map((c) => c.body.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('429: đếm ngược theo retryAfterSeconds (đổi sang phút khi >= 90 giây), khóa nút, giữ form, không gửi thêm', async () => {
    const { user, calls } = open({
      'POST /orders': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 3000 }),
    });
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByText(/Bạn thao tác quá nhanh, thử lại sau 50 phút nữa\./);
    const button = screen.getByRole('button', { name: 'Thử lại sau 50 phút' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(await field.name()).toHaveValue(RECIPIENT.name);
    await user.click(button);
    expect(posts(calls)).toHaveLength(1);
  });

  it('bấm đúp khi đang gửi chỉ tạo một request', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { user, calls, router } = open({
      'POST /orders': async () => {
        await gate;
        return ok(orderOf(), 201);
      },
    });
    await fillForm(user);
    await user.dblClick(submitButton());
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(screen.getByRole('button', { name: /Đang gửi đơn/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o1'));
    expect(posts(calls)).toHaveLength(1);
  });
});
