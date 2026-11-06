import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { fail, ok, renderApp } from '../../test/renderApp.jsx';
import { BANNED_WORDS, RECIPIENT, baseRoutes, orderOf } from '../../test/commerceKit.js';
import { formatPriceVnd } from '../cart/cartFormat.js';

// Intl dùng khoảng trắng không ngắt (NBSP); DOM matcher gộp mọi khoảng trắng thành dấu cách.
const price = (value) => formatPriceVnd(value).replace(/\s/g, ' ');

const summary = (n, extra = {}) => ({
  id: `o${n}`,
  code: `DH${String(n).padStart(6, '0')}`,
  createdAt: '2026-11-06T02:00:00.000Z',
  itemCount: 3,
  totalVnd: 848000,
  ...extra,
});
const page = (numbers, { page: p = 1, limit = 20, total = numbers.length } = {}) =>
  ok({
    items: numbers.map((n) => summary(n)),
    pagination: { page: p, limit, total, totalPages: Math.ceil(total / limit) },
  });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const open = (routes, path) => renderApp(path, { token: 'jwt', routes: baseRoutes(routes) });

describe('Đơn của tôi (AC-19)', () => {
  it('hiện số đơn, thời gian giờ Việt Nam, số món, tổng; không có số điện thoại, địa chỉ, trạng thái', async () => {
    open({ 'GET /orders': page([123]) }, '/orders');
    const row = (await screen.findByRole('link', { name: /DH000123/ })).closest('li');
    expect(row).toHaveTextContent('09:00, 06/11/2026');
    expect(row).toHaveTextContent('3 món');
    expect(row).toHaveTextContent(price(848000));
    expect(row.querySelector('a')).toHaveAttribute('href', '/orders/o123');
    const text = document.body.textContent;
    expect(text).not.toContain(RECIPIENT.phone);
    expect(text).not.toMatch(/Đang xử lý|Đang giao|Hoàn tất|Hủy đơn/i);
    expect(text).not.toMatch(BANNED_WORDS);
  });

  it('trang 1 của 25 đơn: 20 dòng, phân trang, "Sau" đổi URL và gọi API với page=2', async () => {
    const { user, calls, router } = open(
      {
        'GET /orders': (_, config) =>
          config.params.page === 2
            ? page(range(21, 25), { page: 2, total: 25 })
            : page(range(1, 20), { total: 25 }),
      },
      '/orders',
    );
    await screen.findByRole('link', { name: /DH000001/ });
    expect(screen.getAllByRole('link', { name: /^DH\d{6}/ })).toHaveLength(20);
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1–20 trên 25 đơn')).toBeInTheDocument();
    expect(screen.getByText('25 đơn')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByRole('link', { name: /DH000021/ });
    expect(router.state.location.search).toBe('?page=2');
    expect(screen.getAllByRole('link', { name: /^DH\d{6}/ })).toHaveLength(5);
    expect(calls.filter((c) => c.key === 'GET /orders').map((c) => c.params.page)).toEqual([1, 2]);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('page sai trên URL được coi là 1; trang vượt tổng lùi về trang cuối (replace)', async () => {
    const bad = open({ 'GET /orders': page(range(1, 3)) }, '/orders?page=abc');
    await screen.findByRole('link', { name: /DH000001/ });
    expect(bad.calls.find((c) => c.key === 'GET /orders').params.page).toBe(1);
    bad.unmount();

    const over = open(
      {
        'GET /orders': (_, config) =>
          config.params.page === 9
            ? ok({ items: [], pagination: { page: 9, limit: 20, total: 25, totalPages: 2 } })
            : page(range(21, 25), { page: 2, total: 25 }),
      },
      '/orders?page=9',
    );
    await waitFor(() => expect(over.router.state.location.search).toBe('?page=2'));
    expect(over.router.state.historyAction).toBe('REPLACE');
    await screen.findByRole('link', { name: /DH000021/ });
  });

  it('rỗng: lời mời về phòng thử đồ; lỗi tải: Thử lại; 429: đếm ngược và khóa Thử lại', async () => {
    const empty = open({ 'GET /orders': page([]) }, '/orders');
    await screen.findByText('Bạn chưa có đơn hàng nào.');
    expect(screen.getByRole('link', { name: 'Vào phòng thử đồ' })).toHaveAttribute(
      'href',
      '/try-on',
    );
    empty.unmount();

    let broken = true;
    const err = open(
      { 'GET /orders': () => (broken ? fail(500, 'INTERNAL_ERROR') : page([5])) },
      '/orders',
    );
    await screen.findByText('Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.');
    broken = false;
    await err.user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('link', { name: /DH000005/ });
    err.unmount();

    const limited = open(
      { 'GET /orders': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 30 }) },
      '/orders',
    );
    await screen.findByText(/Bạn thao tác quá nhanh, thử lại sau 30 giây\./);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    limited.unmount();
  });
});

describe('Chi tiết đơn (AC-09, E14)', () => {
  it('hiện bản chụp, nhãn "Đã ngừng bán" đúng dòng, thông tin nhận hàng; không banner khi xem lại', async () => {
    open({ 'GET /orders/o1': ok(orderOf()) }, '/orders/o1');
    await screen.findByRole('heading', { level: 1, name: 'Đơn DH000123' });
    const items = screen.getAllByRole('listitem');
    const a = items.find((li) => li.textContent.includes('Áo A'));
    const b = items.find((li) => li.textContent.includes('Áo B'));
    expect(a).toHaveTextContent(price(199000));
    expect(a).toHaveTextContent('2');
    expect(a).toHaveTextContent(price(398000));
    expect(within(a).queryByText('Đã ngừng bán')).toBeNull();
    expect(within(b).getByText('Đã ngừng bán')).toBeInTheDocument();
    expect(document.querySelector('[data-order-total]')).toHaveTextContent(price(848000));
    expect(screen.getByText('Thông tin nhận hàng')).toBeInTheDocument();
    expect(screen.getByText(RECIPIENT.phone)).toBeInTheDocument();
    expect(screen.getByText(RECIPIENT.address)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Lưu ý về thanh toán' })).toHaveTextContent(
      'Chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp.',
    );
    expect(screen.queryByText(/Đã ghi nhận đơn hàng/)).toBeNull();
    expect(document.body.textContent).not.toMatch(BANNED_WORDS);
    expect(screen.queryByRole('button', { name: /hủy|sửa|mua lại/i })).toBeNull();
  });

  it('vừa đặt xong: banner "Đã ghi nhận đơn hàng", hai link ở cuối; state.placed bị xóa để tải lại không hiện lại', async () => {
    const { router } = open({ 'GET /orders/o1': ok(orderOf()) }, [
      { pathname: '/orders/o1', state: { placed: true } },
    ]);
    await screen.findByText('Đã ghi nhận đơn hàng DH000123.');
    expect(screen.getByRole('link', { name: 'Xem tất cả đơn hàng' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(screen.getByRole('link', { name: 'Tiếp tục thử đồ' })).toHaveAttribute(
      'href',
      '/try-on',
    );
    await waitFor(() => expect(router.state.location.state?.placed).toBeUndefined());
    // Banner vẫn còn trên màn hình sau khi xóa state.
    expect(screen.getByText('Đã ghi nhận đơn hàng DH000123.')).toBeInTheDocument();
  });

  it('404: cùng một câu cho đơn không có và đơn của người khác, lối về Đơn của tôi', async () => {
    open({ 'GET /orders/o9': fail(404, 'NOT_FOUND') }, '/orders/o9');
    await screen.findByRole('heading', { level: 2, name: 'Không tìm thấy đơn hàng.' });
    expect(screen.getByRole('link', { name: 'Về Đơn của tôi' })).toHaveAttribute('href', '/orders');
  });

  it('lỗi tải: Thử lại; nút quay lại về đúng trang danh sách đã đến từ', async () => {
    let broken = true;
    const { user } = open(
      { 'GET /orders/o1': () => (broken ? fail(500, 'INTERNAL_ERROR') : ok(orderOf())) },
      [{ pathname: '/orders/o1', state: { from: '?page=2' } }],
    );
    await screen.findByText('Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại.');
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('heading', { level: 1, name: 'Đơn DH000123' });
    expect(screen.getByRole('link', { name: /Đơn của tôi/ })).toHaveAttribute(
      'href',
      '/orders?page=2',
    );
  });
});
