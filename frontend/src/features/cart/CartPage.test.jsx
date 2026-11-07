import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ADMIN, fail, ok, renderApp } from '../../test/renderApp.jsx';
import { baseRoutes, cartOf, goneLine, line } from '../../test/commerceKit.js';
import { formatPriceVnd } from './cartFormat.js';

// Intl dùng khoảng trắng không ngắt (NBSP); DOM matcher gộp mọi khoảng trắng thành dấu cách.
const price = (value) => formatPriceVnd(value).replace(/\s/g, ' ');
const heading = (name) => screen.findByRole('heading', { level: 1, name });
const lineOf = (name) => screen.getByRole('group', { name: `Số lượng ${name}` }).closest('li');
const placeLink = () => screen.queryByRole('link', { name: 'Đặt hàng' });

/** Giỏ có trạng thái: PATCH, DELETE đổi giỏ mà GET trả (bài học sprint 2: mock tĩnh làm lần tải lại ghi đè). */
function statefulCart(initial) {
  const state = { items: initial };
  const respond = () => ok(cartOf(state.items));
  return {
    state,
    routes: {
      'GET /cart': () => respond(),
      'PATCH /cart/items/p1': (body) => {
        state.items = state.items.map((i) =>
          i.productId === 'p1'
            ? { ...i, quantity: body.quantity, lineTotalVnd: i.priceVnd * body.quantity }
            : i,
        );
        return respond();
      },
      'DELETE /cart/items/p1': () => {
        state.items = state.items.filter((i) => i.productId !== 'p1');
        return respond();
      },
      'DELETE /cart/items/p2': () => {
        state.items = state.items.filter((i) => i.productId !== 'p2');
        return respond();
      },
    },
  };
}

const open = (routes, path = '/cart') =>
  renderApp(path, { token: 'jwt', routes: baseRoutes(routes) });

describe('xem giỏ và tổng tiền (AC-01)', () => {
  it('hiện từng dòng và tổng tiền đúng như API trả, không tự cộng', async () => {
    // Tổng cố ý lệch với tổng các dòng: nếu FE tự cộng, số hiện ra sẽ là 848.000.
    const items = [line(1, 2), line(2, 1)];
    open({ 'GET /cart': ok(cartOf(items, { totalVnd: 777000 })) });
    await heading('Giỏ hàng');
    await screen.findByText('Áo 1');
    expect(screen.getByText('Áo 2')).toBeInTheDocument();
    const total = document.querySelector('[data-cart-total]');
    expect(total).toHaveTextContent(price(777000));
    expect(total).not.toHaveTextContent(price(items[0].lineTotalVnd + items[1].lineTotalVnd));
    expect(lineOf('Áo 1')).toHaveTextContent(price(items[0].lineTotalVnd));
    expect(screen.getByText('3 món')).toBeInTheDocument();
    expect(placeLink()).toHaveAttribute('href', '/checkout');
  });

  it('giỏ rỗng: có lối về /try-on và /orders, không có nút Đặt hàng (AC-02)', async () => {
    open({ 'GET /cart': ok(cartOf([])) });
    await screen.findByRole('heading', { level: 2, name: 'Giỏ hàng của bạn đang trống' });
    expect(screen.getByRole('link', { name: 'Vào phòng thử đồ' })).toHaveAttribute(
      'href',
      '/try-on',
    );
    expect(screen.getByRole('link', { name: 'Xem đơn của tôi' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(screen.queryByText('Đặt hàng')).not.toBeInTheDocument();
  });

  it('giá đã đổi: hiện giá hiện tại và "Giá đã đổi từ X" (AC-05)', async () => {
    open({
      'GET /cart': ok(
        cartOf([line(1, 1, { priceVnd: 150000, lineTotalVnd: 150000, priceChangedFrom: 100000 })]),
      ),
    });
    await screen.findByText(`Giá đã đổi từ ${price(100000)}`);
    expect(lineOf('Áo 1')).toHaveTextContent(price(150000));
  });

  it('lỗi tải: thông báo và Thử lại, không hiện tổng tiền, không có nút Đặt hàng (E15)', async () => {
    // Số lần GET khi mở trang phụ thuộc thứ tự effect (provider và trang), nên lỗi theo cờ, không theo số lần gọi.
    let broken = true;
    const { user } = open({
      'GET /cart': () => (broken ? fail(500, 'INTERNAL_ERROR') : ok(cartOf([line(1)]))),
    });
    await screen.findByText('Không thể tải giỏ hàng. Vui lòng kiểm tra mạng và thử lại.');
    expect(document.querySelector('[data-cart-total]')).toBeNull();
    expect(placeLink()).toBeNull();
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Áo 1');
    expect(document.querySelector('[data-cart-total]')).toBeInTheDocument();
  });
});

describe('đổi số lượng, bỏ dòng (AC-03)', () => {
  it('+ gửi số tuyệt đối n+1; tổng và số lượng chỉ đổi theo response', async () => {
    const { routes, state } = statefulCart([line(1, 2), line(2, 1)]);
    const { user, calls } = open(routes);
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await waitFor(() => expect(lineOf('Áo 1')).toHaveTextContent('3'));
    const patches = calls.filter((c) => c.key.startsWith('PATCH'));
    expect(patches).toEqual([
      expect.objectContaining({ key: 'PATCH /cart/items/p1', body: { quantity: 3 } }),
    ]);
    expect(document.querySelector('[data-cart-total]')).toHaveTextContent(
      price(state.items.reduce((s, i) => s + i.lineTotalVnd, 0)),
    );
  });

  it('− ở số lượng 1 bị khóa mềm: bấm không gửi request (không giảm về 0)', async () => {
    const { routes } = statefulCart([line(1, 1)]);
    const { user, calls } = open(routes);
    await screen.findByText('Áo 1');
    const minus = screen.getByRole('button', { name: 'Giảm số lượng Áo 1' });
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    expect(minus).not.toBeDisabled(); // vẫn focus được
    await user.click(minus);
    // Dấu hiệu đã xử lý xong click: một lần bấm + sẽ gửi PATCH, nên đo bằng nút khác để có điểm chờ.
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await waitFor(() => expect(lineOf('Áo 1')).toHaveTextContent('2'));
    expect(calls.filter((c) => c.key.startsWith('PATCH')).map((c) => c.body.quantity)).toEqual([2]);
  });

  it('409 CART_QUANTITY_LIMIT: lỗi dưới dòng lấy maxQuantity từ details, số lượng giữ nguyên', async () => {
    const { user } = open({
      'GET /cart': ok(cartOf([line(1, 3)])),
      'PATCH /cart/items/p1': fail(409, 'CART_QUANTITY_LIMIT', 'x', { maxQuantity: 7 }),
    });
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Mỗi sản phẩm chỉ đặt tối đa 7 món.');
    expect(lineOf('Áo 1')).toHaveTextContent('3');
  });

  it('+ ở mức tối đa (limits) bị khóa mềm kèm dòng mô tả', async () => {
    const { user, calls } = open({
      'GET /cart': ok(cartOf([line(1, 10)])),
    });
    await screen.findByText('Áo 1');
    const plus = screen.getByRole('button', { name: 'Tăng số lượng Áo 1' });
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).toHaveAccessibleDescription('Đã đạt tối đa 10 món.');
    await user.click(plus);
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('PATCH 404 và dòng đã mất: tải lại giỏ, "Sản phẩm này không còn trong giỏ." (E1)', async () => {
    let gone = false;
    const { user } = open({
      'GET /cart': () => ok(cartOf(gone ? [line(2)] : [line(1), line(2)])),
      'PATCH /cart/items/p1': () => {
        gone = true;
        return fail(404, 'NOT_FOUND');
      },
    });
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await screen.findByText('Sản phẩm này không còn trong giỏ.');
    await waitFor(() => expect(screen.queryByText('Áo 1')).not.toBeInTheDocument());
  });

  it('PATCH 404 và dòng vừa ngừng bán: dòng chuyển "Không còn bán", Đặt hàng bị khóa (E2)', async () => {
    let gone = false;
    const { user } = open({
      'GET /cart': () => ok(cartOf(gone ? [goneLine(1)] : [line(1)])),
      'PATCH /cart/items/p1': () => {
        gone = true;
        return fail(404, 'NOT_FOUND');
      },
    });
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await screen.findByText('Áo 1 vừa ngừng bán.');
    expect(screen.getAllByText('Không còn bán').length).toBeGreaterThan(0);
    expect(placeLink()).toBeNull();
  });

  it('429: nêu số giây từ details và khóa thao tác tới hết giờ', async () => {
    const { user, calls } = open({
      'GET /cart': ok(cartOf([line(1, 2)])),
      'PATCH /cart/items/p1': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 45 }),
    });
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await screen.findByText(/Bạn thao tác quá nhanh, thử lại sau 45 giây\./);
    const plus = screen.getByRole('button', { name: 'Tăng số lượng Áo 1' });
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    await user.click(plus);
    expect(calls.filter((c) => c.key.startsWith('PATCH'))).toHaveLength(1);
  });

  it('500: thông báo chung, giỏ giữ nguyên số đã biết', async () => {
    const { user } = open({
      'GET /cart': ok(cartOf([line(1, 2)])),
      'PATCH /cart/items/p1': fail(500, 'INTERNAL_ERROR'),
    });
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng Áo 1' }));
    await screen.findByText('Chưa cập nhật được giỏ hàng. Vui lòng thử lại.');
    expect(lineOf('Áo 1')).toHaveTextContent('2');
  });
});

describe('dòng ngừng bán (AC-08)', () => {
  it('hiện "Không còn bán", không giá, không stepper; Đặt hàng khóa kèm lý do; bỏ dòng thì mở khóa', async () => {
    const { routes } = statefulCart([goneLine(1, 2), line(2, 1)]);
    const { user } = open(routes);
    await screen.findByText('Áo 1');
    const gone = screen.getByText('Áo 1').closest('li');
    expect(within(gone).getByText('Không còn bán')).toBeInTheDocument();
    expect(within(gone).getByText('Không tính vào tổng tiền.')).toBeInTheDocument();
    expect(within(gone).queryByRole('group')).toBeNull();
    expect(screen.getByText(/Có 1 sản phẩm không còn bán/)).toBeInTheDocument();

    const order = screen.getByRole('button', { name: 'Đặt hàng' });
    expect(order).toHaveAttribute('aria-disabled', 'true');
    expect(order).toHaveAccessibleDescription(
      'Hãy bỏ sản phẩm không còn bán khỏi giỏ để đặt hàng.',
    );
    expect(placeLink()).toBeNull();

    const [removeButton] = within(gone).getAllByRole('button', { name: 'Bỏ Áo 1 khỏi giỏ' });
    await user.click(removeButton);
    await waitFor(() => expect(placeLink()).toHaveAttribute('href', '/checkout'));
    expect(screen.queryByText(/không còn bán/i)).not.toBeInTheDocument();
  });
});

describe('focus sau khi bỏ dòng', () => {
  it('về nút Bỏ của dòng kế tiếp; hết dòng thì về tiêu đề "giỏ trống", không rơi về body', async () => {
    const { routes } = statefulCart([line(1), line(2)]);
    const { user } = open(routes);
    await screen.findByText('Áo 1');
    await user.click(screen.getByRole('button', { name: 'Bỏ Áo 1 khỏi giỏ' }));
    await waitFor(() => expect(screen.queryByText('Áo 1')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bỏ Áo 2 khỏi giỏ' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Bỏ Áo 2 khỏi giỏ' }));
    const empty = await screen.findByRole('heading', { level: 2, name: /đang trống/ });
    await waitFor(() => expect(empty).toHaveFocus());
  });
});

describe('quyền và lối vào', () => {
  it('admin vào /cart bị chuyển về /admin và không gọi API giỏ', async () => {
    const { router, calls } = renderApp('/cart', {
      token: 'jwt',
      routes: { 'GET /auth/me': ok({ user: ADMIN }) },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(calls.some((c) => c.key.includes('/cart'))).toBe(false);
  });

  it('header có link tới /cart; menu tài khoản có Giỏ hàng (kèm số món) và Đơn của tôi', async () => {
    const { user } = open({ 'GET /cart': ok(cartOf([line(1, 2)])) }, '/');
    await screen.findByRole('link', { name: 'Giỏ hàng, 2 món' });
    expect(screen.getByRole('link', { name: 'Giỏ hàng, 2 món' })).toHaveAttribute('href', '/cart');
    await user.click(screen.getByRole('button', { name: 'Tài khoản' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Giỏ hàng/ })).toHaveAttribute(
      'href',
      '/cart',
    );
    expect(within(menu).getByText('2 món')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Đơn của tôi' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('ở /cart: link giỏ trên header có aria-current="page"', async () => {
    open({ 'GET /cart': ok(cartOf([line(1)])) });
    const link = await screen.findByRole('link', { name: /^Giỏ hàng, 1 món/ });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
