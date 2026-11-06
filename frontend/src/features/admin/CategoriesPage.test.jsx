import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ADMIN, USER, fail, ok, renderApp } from '../../test/renderApp.jsx';

const cat = (id, name, productCount = 0) => ({
  id,
  name,
  productCount,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});
const SEED = [cat('c1', 'Áo thun'), cat('c2', 'Váy', 2), cat('c3', 'Quần Jeans')];

const renderCategories = (routes = {}) =>
  renderApp('/admin/categories', {
    token: 'jwt',
    routes: { 'GET /auth/me': ok({ user: ADMIN }), ...routes },
  });

const rowOf = (name) => screen.getByText(name).closest('li');
const dialog = () => screen.findByRole('dialog');

describe('Trang Danh mục: phân quyền và tải (AC-01, AC-09, E8)', () => {
  it('user thường vào /admin/categories thấy 403, không gọi API danh mục', async () => {
    const { calls } = renderApp('/admin/categories', {
      token: 'jwt',
      routes: { 'GET /auth/me': ok({ user: USER }) },
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bạn không có quyền truy cập.' }),
    ).toBeInTheDocument();
    // Người mua đăng nhập nào cũng tải giỏ một lần (US-07); ngoài ra không có API nào khác.
    expect(calls.map((c) => c.key)).toEqual(['GET /auth/me', 'GET /cart']);
  });

  it('giữ thứ tự server trả, số sản phẩm đúng', async () => {
    renderCategories({ 'GET /admin/categories': ok({ categories: SEED }) });
    await screen.findByText('Áo thun');
    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    const order = ['Áo thun', 'Váy', 'Quần Jeans'].map((n) =>
      names.findIndex((t) => t.includes(n)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(within(rowOf('Váy')).getByText('2 sản phẩm')).toBeInTheDocument();
  });

  it('lỗi tải: có nút Thử lại, ẩn nút Thêm (D-58); thử lại thành công thì hiện danh sách', async () => {
    let attempts = 0;
    const { user } = renderCategories({
      'GET /admin/categories': () =>
        (attempts += 1) === 1 ? fail(500, 'INTERNAL_ERROR') : ok({ categories: SEED }),
    });
    expect(await screen.findByText(/Không thể tải danh mục/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm danh mục' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Áo thun')).toBeInTheDocument();
  });
});

describe('Trang Danh mục: thêm và đổi tên (AC-02, AC-03, AC-04)', () => {
  it('tên sai hoặc trùng bị chặn ở FE, không gọi API; tên hợp lệ gửi bản đã chuẩn hóa', async () => {
    const created = cat('c4', 'Áo khoác');
    let list = SEED; // server giả giữ trạng thái: lần tải lại sau khi ghi phải thấy kết quả
    const { user, calls } = renderCategories({
      'GET /admin/categories': () => ok({ categories: list }),
      'POST /admin/categories': () => {
        list = [...SEED, created];
        return ok({ category: created }, 201);
      },
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Thêm danh mục' }));
    const box = await dialog();
    const input = within(box).getByLabelText('Tên danh mục');

    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(await within(box).findByText('Vui lòng nhập tên danh mục.')).toBeInTheDocument();

    await user.type(input, 'A');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(
      await within(box).findByText('Tên danh mục phải từ 2 đến 50 ký tự.'),
    ).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'ÁO THUN');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(await within(box).findByText('Danh mục này đã tồn tại.')).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'POST /admin/categories')).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '  Áo   khoác ');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.key === 'POST /admin/categories').body).toEqual({
      name: 'Áo khoác',
    });
    expect(screen.getByText('Áo khoác')).toBeInTheDocument();
    expect(screen.getByText('Đã thêm danh mục')).toBeInTheDocument();
  });

  it('409 từ server (race giữa hai tab): lỗi dưới ô, giữ hộp thoại và nội dung đang nhập', async () => {
    const { user } = renderCategories({
      'GET /admin/categories': ok({ categories: SEED }),
      'POST /admin/categories': fail(409, 'CATEGORY_NAME_EXISTS', 'x'),
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Thêm danh mục' }));
    const box = await dialog();
    await user.type(within(box).getByLabelText('Tên danh mục'), 'Áo sơ mi');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(await within(box).findByText('Danh mục này đã tồn tại.')).toBeInTheDocument();
    expect(within(box).getByLabelText('Tên danh mục')).toHaveValue('Áo sơ mi');
  });

  it('500 khi lưu: báo lỗi chung trong hộp thoại, giữ nội dung đang nhập', async () => {
    const { user } = renderCategories({
      'GET /admin/categories': ok({ categories: SEED }),
      'POST /admin/categories': fail(500, 'INTERNAL_ERROR'),
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Thêm danh mục' }));
    const box = await dialog();
    await user.type(within(box).getByLabelText('Tên danh mục'), 'Áo sơ mi');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(
      await within(box).findByText('Đã có lỗi xảy ra. Vui lòng thử lại sau.'),
    ).toBeInTheDocument();
    expect(within(box).getByLabelText('Tên danh mục')).toHaveValue('Áo sơ mi');
  });

  it('đổi tên: tên không đổi thì đóng, không gọi API; tên mới thì PATCH và cập nhật dòng', async () => {
    let list = SEED;
    const { user, calls } = renderCategories({
      'GET /admin/categories': () => ok({ categories: list }),
      'PATCH /admin/categories/c2': () => {
        const renamed = cat('c2', 'Váy đầm', 2);
        list = [SEED[0], renamed, SEED[2]];
        return ok({ category: renamed });
      },
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Sửa danh mục Váy' }));
    let box = await dialog();
    expect(within(box).getByLabelText('Tên danh mục')).toHaveValue('Váy');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Sửa danh mục Váy' }));
    box = await dialog();
    const input = within(box).getByLabelText('Tên danh mục');
    await user.clear(input);
    await user.type(input, 'Váy đầm');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã đổi tên danh mục')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /admin/categories/c2').body).toEqual({
      name: 'Váy đầm',
    });
    expect(within(rowOf('Váy đầm')).getByText('2 sản phẩm')).toBeInTheDocument();
  });

  it('404 khi đổi tên (danh mục đã bị xóa): đóng hộp thoại, báo lỗi, tải lại danh sách', async () => {
    let lists = 0;
    const { user } = renderCategories({
      'GET /admin/categories': () => {
        lists += 1;
        return ok({ categories: lists === 1 ? SEED : SEED.slice(1) });
      },
      'PATCH /admin/categories/c1': fail(404, 'NOT_FOUND'),
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Sửa danh mục Áo thun' }));
    const box = await dialog();
    const input = within(box).getByLabelText('Tên danh mục');
    await user.clear(input);
    await user.type(input, 'Áo phông');
    await user.click(within(box).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Không tìm thấy danh mục.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Áo thun')).not.toBeInTheDocument());
    expect(lists).toBe(2);
  });
});

describe('Trang Danh mục: xóa (AC-06, AC-07, E5, E6)', () => {
  it('còn sản phẩm theo danh sách: chế độ chặn, không có nút Xóa, không gọi API xóa', async () => {
    const { user, calls } = renderCategories({
      'GET /admin/categories': ok({ categories: SEED }),
    });
    await screen.findByText('Váy');
    await user.click(screen.getByRole('button', { name: 'Xóa danh mục Váy' }));
    const box = await dialog();
    expect(
      within(box).getByText(
        'Danh mục đang có 2 sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước.',
      ),
    ).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: 'Xóa danh mục' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
  });

  it('danh mục trống: xác nhận rồi xóa, dòng biến mất', async () => {
    let list = SEED;
    const { user, calls } = renderCategories({
      'GET /admin/categories': () => ok({ categories: list }),
      'DELETE /admin/categories/c1': () => {
        list = SEED.slice(1);
        return ok({ id: 'c1' });
      },
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Xóa danh mục Áo thun' }));
    const box = await dialog();
    expect(within(box).getByText(/Không thể hoàn tác/)).toBeInTheDocument();
    await user.click(within(box).getByRole('button', { name: 'Xóa danh mục' }));
    expect(await screen.findByText('Đã xóa danh mục')).toBeInTheDocument();
    expect(screen.queryByText('Áo thun')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'DELETE /admin/categories/c1')).toHaveLength(1);
  });

  it('409 từ server: hộp thoại đổi sang chế độ chặn với số sản phẩm của server', async () => {
    let lists = 0;
    const { user } = renderCategories({
      'GET /admin/categories': () => {
        lists += 1;
        return ok({ categories: lists === 1 ? SEED : [cat('c1', 'Áo thun', 3), ...SEED.slice(1)] });
      },
      'DELETE /admin/categories/c1': fail(409, 'CATEGORY_HAS_PRODUCTS', 'x', { productCount: 3 }),
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Xóa danh mục Áo thun' }));
    const box = await dialog();
    await user.click(within(box).getByRole('button', { name: 'Xóa danh mục' }));
    expect(
      await screen.findByText(
        'Danh mục đang có 3 sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Chưa thể xóa danh mục' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa danh mục' })).not.toBeInTheDocument();
    await waitFor(() => expect(lists).toBe(2));
  });

  it('404 khi xóa: đóng hộp thoại, báo lỗi và tải lại', async () => {
    const { user } = renderCategories({
      'GET /admin/categories': ok({ categories: SEED }),
      'DELETE /admin/categories/c1': fail(404, 'NOT_FOUND'),
    });
    await screen.findByText('Áo thun');
    await user.click(screen.getByRole('button', { name: 'Xóa danh mục Áo thun' }));
    await user.click(within(await dialog()).getByRole('button', { name: 'Xóa danh mục' }));
    expect(await screen.findByText('Không tìm thấy danh mục.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Trang Danh mục: rỗng (R4)', () => {
  it('không còn danh mục: hiện empty state và vẫn thêm được', async () => {
    renderCategories({ 'GET /admin/categories': ok({ categories: [] }) });
    expect(await screen.findByText('Chưa có danh mục')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Thêm danh mục' })).toHaveLength(2);
  });
});
