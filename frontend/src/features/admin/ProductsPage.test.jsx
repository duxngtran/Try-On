import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ADMIN, fail, ok, renderApp } from '../../test/renderApp.jsx';

const cat = (id, name, productCount = 0) => ({
  id,
  name,
  productCount,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});
const CATEGORIES = [cat('3f2b8c1e-5a4d-4b6f-9c7e-1a2b3c4d5e01', 'Áo thun', 3), cat('c2', 'Váy', 0)];
const SHIRT = CATEGORIES[0];

const product = (n, category = SHIRT) => ({
  id: `p${n}`,
  name: `Sản phẩm ${n}`,
  priceVnd: 199000 + n * 1000,
  category: { id: category.id, name: category.name },
  image: { url: `https://img.example/p${n}.jpg`, version: 1 },
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});
const page = (items, { p = 1, total = items.length, totalPages = 1 } = {}) =>
  ok({ items, pagination: { page: p, limit: 20, total, totalPages } });

const renderProducts = (path, routes = {}) =>
  renderApp(path, {
    token: 'jwt',
    routes: {
      'GET /auth/me': ok({ user: ADMIN }),
      'GET /admin/categories': ok({ categories: CATEGORIES }),
      ...routes,
    },
  });

describe('lối vào từ trang Danh mục và khung quản trị (D-62)', () => {
  it('AdminNav và card /admin dẫn tới Sản phẩm; số sản phẩm >= 1 là link đã lọc, 0 thì không', async () => {
    renderProducts('/admin/categories');
    const nav = await screen.findByRole('navigation', { name: 'Quản trị' });
    expect(within(nav).getByRole('link', { name: 'Sản phẩm' })).toHaveAttribute(
      'href',
      '/admin/products',
    );
    expect(within(nav).queryByText('Sắp ra mắt', { selector: 'span' })).toBeInTheDocument(); // chỉ còn Đơn hàng
    const link = await screen.findByRole('link', { name: '3 sản phẩm' });
    expect(link).toHaveAttribute('href', `/admin/products?categoryId=${SHIRT.id}`);
    expect(screen.queryByRole('link', { name: '0 sản phẩm' })).not.toBeInTheDocument();
    expect(screen.getByText('0 sản phẩm')).toBeInTheDocument();
  });

  it('hộp thoại chặn xóa danh mục còn sản phẩm có nút "Xem sản phẩm" tới danh sách đã lọc; không gọi API xóa', async () => {
    const { user, calls } = renderProducts('/admin/categories');
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Xóa danh mục Áo thun' }));
    const box = await screen.findByRole('dialog');
    expect(within(box).getByRole('link', { name: 'Xem sản phẩm' })).toHaveAttribute(
      'href',
      `/admin/products?categoryId=${SHIRT.id}`,
    );
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
  });

  it('card Sản phẩm trên /admin bấm được', async () => {
    renderProducts('/admin', { 'GET /admin/ping': ok({ ok: true }) });
    const card = await screen.findByRole('link', { name: /Thêm, sửa, xóa sản phẩm và ảnh/ });
    expect(card).toHaveAttribute('href', '/admin/products');
  });
});

describe('danh sách sản phẩm (AC-11)', () => {
  it('hiện giá dạng 199.000 ₫, danh mục, phân trang; tham số URL sai được chuẩn hóa trước khi gọi API', async () => {
    const { calls } = renderProducts('/admin/products?page=0&categoryId=abc', {
      'GET /admin/products': page([product(1), product(2)], { total: 25, totalPages: 2 }),
    });
    expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument();
    expect(screen.getByText('200.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('25 sản phẩm')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1–20 trên 25 sản phẩm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trước/ })).toBeDisabled();
    const listCall = calls.find((c) => c.key === 'GET /admin/products');
    expect(listCall.params).toEqual({ page: 1, limit: 20 });
    const img = screen.getByAltText('Sản phẩm 1');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('một trang hoặc ít hơn: không có phân trang', async () => {
    renderProducts('/admin/products', { 'GET /admin/products': page([product(1)]) });
    await screen.findByText('Sản phẩm 1');
    expect(screen.queryByRole('navigation', { name: 'Phân trang' })).not.toBeInTheDocument();
  });

  it('đổi danh mục lọc: gọi API với categoryId và về trang 1 (bỏ page khỏi URL)', async () => {
    const { user, calls, router } = renderProducts('/admin/products?page=2', {
      'GET /admin/products': (_, config) =>
        page([product(config.params.page * 10)], {
          p: config.params.page,
          total: 25,
          totalPages: 2,
        }),
    });
    await screen.findByText('Sản phẩm 20');
    await screen.findByRole('option', { name: 'Áo thun' });
    await user.selectOptions(screen.getByLabelText('Danh mục'), SHIRT.id);
    await screen.findByText('Sản phẩm 10');
    const last = calls.filter((c) => c.key === 'GET /admin/products').at(-1);
    expect(last.params).toEqual({ page: 1, limit: 20, categoryId: SHIRT.id });
    expect(router.state.location.search).toBe(`?categoryId=${SHIRT.id}`);
  });

  it('chuyển trang bằng nút Sau cập nhật URL; lọc theo danh mục đã xóa hiện lựa chọn "không còn tồn tại"', async () => {
    const gone = '3f2b8c1e-5a4d-4b6f-9c7e-1a2b3c4d5eff';
    const { user, router } = renderProducts('/admin/products', {
      'GET /admin/products': (_, config) =>
        page([product(config.params.page)], { p: config.params.page, total: 25, totalPages: 2 }),
    });
    await screen.findByText('Sản phẩm 1');
    await user.click(screen.getByRole('button', { name: /Sau/ }));
    await screen.findByText('Sản phẩm 2');
    expect(router.state.location.search).toBe('?page=2');
    await router.navigate(`/admin/products?categoryId=${gone}`);
    const option = await screen.findByRole('option', { name: 'Danh mục không còn tồn tại' });
    expect(option.selected).toBe(true);
    expect(screen.getByLabelText('Danh mục')).toBeDisabled();
  });
});

describe('trạng thái rỗng và lỗi', () => {
  it('rỗng không lọc: mời thêm sản phẩm đầu tiên', async () => {
    renderProducts('/admin/products', { 'GET /admin/products': page([]) });
    expect(await screen.findByText('Chưa có sản phẩm')).toBeInTheDocument();
  });

  it('rỗng khi lọc: có nút Xóa bộ lọc đưa về danh sách đầy đủ', async () => {
    const { user, router } = renderProducts(`/admin/products?categoryId=${SHIRT.id}`, {
      'GET /admin/products': (_, config) =>
        config.params.categoryId ? page([]) : page([product(1)]),
    });
    expect(await screen.findByText('Không có sản phẩm trong danh mục này')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Xóa bộ lọc' }).at(-1));
    expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('lỗi tải lần đầu có Thử lại; BE trả 400 thì báo "Bộ lọc không hợp lệ."', async () => {
    let attempts = 0;
    const { user } = renderProducts('/admin/products', {
      'GET /admin/products': () =>
        (attempts += 1) === 1 ? fail(500, 'INTERNAL_ERROR') : page([product(1)]),
    });
    expect(await screen.findByText(/Không thể tải sản phẩm/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument();
  });

  it('400 VALIDATION_ERROR: Error state "Bộ lọc không hợp lệ." với nút xóa bộ lọc', async () => {
    renderProducts('/admin/products', {
      'GET /admin/products': fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.'),
    });
    expect(await screen.findByText('Bộ lọc không hợp lệ.')).toBeInTheDocument();
  });
});

describe('xóa sản phẩm (AC-10)', () => {
  it('xóa dòng duy nhất của trang cuối: lùi về trang cuối hợp lệ; toast; dòng biến mất', async () => {
    let items = { 1: [product(1)], 2: [product(21)] };
    const { user, calls, router } = renderProducts('/admin/products?page=2', {
      'GET /admin/products': (_, config) => {
        const p = config.params.page;
        const total = items[1].length + items[2].length;
        return page(items[p] ?? [], { p, total, totalPages: Math.max(1, Math.ceil(total / 1)) });
      },
      'DELETE /admin/products/p21': () => {
        items = { 1: [product(1)], 2: [] };
        return ok({ id: 'p21' });
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa sản phẩm Sản phẩm 21' }));
    const box = await screen.findByRole('dialog');
    expect(within(box).getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.click(within(box).getByRole('button', { name: 'Xóa sản phẩm' }));
    expect(await screen.findByText('Đã xóa sản phẩm')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument();
    expect(screen.queryByText('Sản phẩm 21')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'DELETE /admin/products/p21')).toHaveLength(1);
  });

  it('404 (đã bị xóa từ tab khác): toast lỗi và tải lại danh sách', async () => {
    let attempts = 0;
    const { user } = renderProducts('/admin/products', {
      'GET /admin/products': () => ((attempts += 1) === 1 ? page([product(1)]) : page([])),
      'DELETE /admin/products/p1': fail(404, 'NOT_FOUND'),
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa sản phẩm Sản phẩm 1' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xóa sản phẩm' }),
    );
    expect(await screen.findByText('Sản phẩm không còn tồn tại.')).toBeInTheDocument();
    expect(await screen.findByText('Chưa có sản phẩm')).toBeInTheDocument();
  });

  it('lỗi mạng khi xóa: giữ hộp thoại, báo lỗi, nút Xóa dùng lại được', async () => {
    const { user } = renderProducts('/admin/products', {
      'GET /admin/products': page([product(1)]),
      'DELETE /admin/products/p1': { networkError: true },
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa sản phẩm Sản phẩm 1' }));
    const box = await screen.findByRole('dialog');
    await user.click(within(box).getByRole('button', { name: 'Xóa sản phẩm' }));
    expect(await within(box).findByText('Mất kết nối, vui lòng thử lại.')).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'Xóa sản phẩm' })).toBeEnabled();
  });
});
