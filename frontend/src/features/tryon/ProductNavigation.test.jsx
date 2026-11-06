import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { USER, fail, ok, renderApp } from '../../test/renderApp.jsx';

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
  // Tắt generate trước: các test này kiểm điều hướng; điều kiện generate trước có test riêng ở useNeighbors.test.jsx.
  generation: { available: true, prefetchAllowed: false },
};
const CATEGORIES = [{ id: 'c1', name: 'Áo thun', productCount: 6 }];
const IMAGE = {
  url: 'https://storage.test/tryon.jpg?token=x',
  expiresAt: '2099-01-01T00:00:00.000Z',
  width: 864,
  height: 1296,
};
const product = (n, total = 6) => ({
  id: `p${n}`,
  name: `Áo ${n}`,
  priceVnd: 100000 + n,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: `https://storage.test/p${n}.jpg`, version: 1 },
  position: n,
  total,
});
const asProduct = ({ total: _total, ...rest }) => rest;
const page = (numbers, extra = {}) =>
  ok({
    items: numbers.map((n) => asProduct(product(n))),
    total: 6,
    prevCursor: null,
    nextCursor: null,
    ...extra,
  });
const results = (state, numbers = [1, 2, 3, 4, 5, 6]) =>
  Object.fromEntries(
    numbers.map((n) => [`GET /try-on/products/p${n}/result`, ok(state ?? { state: 'none' })]),
  );
const readyAll = (numbers) => results({ state: 'ready', image: IMAGE }, numbers);

const renderRoom = (routes, path = '/try-on?category=c1') =>
  renderApp(path, {
    token: 'jwt',
    routes: {
      'GET /auth/me': ok({ user: USER }),
      'GET /try-on/state': ok(STATE),
      'GET /try-on/categories': ok({ categories: CATEGORIES }),
      ...routes,
    },
  });
const postsTo = (calls) => calls.filter((c) => c.key.startsWith('POST') && c.key.endsWith('/jobs'));
const nextButton = () => screen.getByRole('button', { name: 'Sản phẩm tiếp theo' });
const prevButton = () => screen.getByRole('button', { name: 'Sản phẩm trước' });
const productHeading = (name) => screen.findByRole('heading', { level: 2, name });
const frame = () => document.querySelector('.touch-pan-y');

describe('mũi tên, đầu và cuối danh sách (AC-01, AC-09, D-84, D-112)', () => {
  it('chuyển tới sản phẩm kế tiếp và quay lại; URL chỉ đổi bằng replace; không POST khi ảnh đã có', async () => {
    const { user, calls, router } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2, 3]),
      ...readyAll([1, 2, 3]),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    await productHeading('Áo 2');
    expect(screen.getByText('Sản phẩm 2 trên 6')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?category=c1&product=p2');
    expect(router.state.historyAction).toBe('REPLACE');
    await user.click(prevButton());
    await productHeading('Áo 1');
    expect(postsTo(calls)).toHaveLength(0);
  });

  it('mỗi lần chuyển vẫn gọi /result để xác nhận dù ảnh đã nằm trong bộ nhớ (D-123)', async () => {
    const { user, calls } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2]),
      ...readyAll([1, 2]),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    await productHeading('Áo 2');
    const before = calls.filter((c) => c.key === 'GET /try-on/products/p1/result').length;
    await user.click(prevButton());
    await productHeading('Áo 1');
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === 'GET /try-on/products/p1/result').length,
      ).toBeGreaterThan(before),
    );
  });

  it('ở đầu danh sách mũi tên trái dùng aria-disabled (không phải disabled), bấm không gọi gì', async () => {
    const { user, calls } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2]),
      ...readyAll([1, 2]),
    });
    await productHeading('Áo 1');
    // Đợi ảnh hiện: tên sản phẩm có trước khi `/result` được gọi, chụp `calls` sớm sẽ đếm thiếu.
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    const prev = prevButton();
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(prev).not.toBeDisabled();
    expect(prev).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft');
    const before = calls.length;
    await user.click(prev);
    expect(calls.length).toBe(before);
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 1' })).toBeInTheDocument();
  });

  it('ở cuối: mũi tên phải tắt, hiện "Bạn đã xem hết danh mục này", không vòng lại; Danh mục khác đưa focus về chip', async () => {
    const { user } = renderRoom({
      'GET /try-on/categories/c1/products': page([5, 6], { total: 6 }),
      ...readyAll([5, 6]),
    });
    await productHeading('Áo 5');
    await user.click(nextButton());
    await productHeading('Áo 6');
    expect(nextButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Bạn đã xem hết danh mục này')).toBeInTheDocument();
    await user.click(nextButton());
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 6' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Danh mục khác' }));
    expect(screen.getByRole('button', { name: 'Áo thun, 6 sản phẩm' })).toHaveFocus();
  });

  it('danh mục 1 sản phẩm: cả hai mũi tên tắt và có thông báo hết danh mục (AC-09)', async () => {
    renderRoom({
      'GET /try-on/categories/c1/products': page([1], { total: 1 }),
      ...readyAll([1]),
    });
    await productHeading('Áo 1');
    expect(prevButton()).toHaveAttribute('aria-disabled', 'true');
    expect(nextButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Bạn đã xem hết danh mục này')).toBeInTheDocument();
  });
});

describe('chuyển nhanh (AC-05, D-86)', () => {
  it('bấm 5 lần liên tiếp rồi dừng: chỉ sản phẩm cuối được POST, sản phẩm bị lướt qua thì không', async () => {
    const { calls } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2, 3, 4, 5, 6]),
      ...results(null),
      'POST /try-on/products/p6/jobs': ok({ state: 'ready', image: IMAGE }),
    });
    await productHeading('Áo 1');
    for (let i = 0; i < 5; i += 1) fireEvent.click(nextButton());
    await productHeading('Áo 6');
    await waitFor(() => expect(postsTo(calls)).toHaveLength(1), { timeout: 3000 });
    expect(postsTo(calls)[0].key).toBe('POST /try-on/products/p6/jobs');
    expect(postsTo(calls)[0].body).toEqual({ purpose: 'display' });
  });
});

describe('vuốt (AC-18)', () => {
  const swipe = (el, from, to, pointerType = 'touch') => {
    fireEvent.pointerDown(el, { pointerType, pointerId: 1, clientX: from[0], clientY: from[1] });
    fireEvent.pointerUp(el, { pointerType, pointerId: 1, clientX: to[0], clientY: to[1] });
  };
  const setup = () =>
    renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2, 3]),
      ...readyAll([1, 2, 3]),
    });

  it('vuốt trái >= 50 px sang sản phẩm kế, vuốt phải quay lại', async () => {
    setup();
    await productHeading('Áo 1');
    swipe(frame(), [200, 100], [120, 105]);
    await productHeading('Áo 2');
    swipe(frame(), [100, 100], [180, 98]);
    await productHeading('Áo 1');
  });

  it('vuốt dọc, vuốt ngang < 50 px, hoặc kéo bằng chuột thì không chuyển (để trang cuộn)', async () => {
    setup();
    await productHeading('Áo 1');
    swipe(frame(), [200, 300], [190, 120]); // dọc
    swipe(frame(), [200, 100], [160, 100]); // ngang 40 px
    swipe(frame(), [200, 100], [100, 100], 'mouse'); // chuột không kéo
    swipe(frame(), [200, 100], [120, 200]); // chéo, dọc lớn hơn ngang
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 1' })).toBeInTheDocument();
  });

  it('vuốt phải ở sản phẩm đầu không gọi API và không đổi sản phẩm', async () => {
    const { calls } = setup();
    await productHeading('Áo 1');
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    const before = calls.length;
    swipe(frame(), [100, 100], [200, 100]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.length).toBe(before);
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 1' })).toBeInTheDocument();
  });
});

describe('phím ← → (không khi đang gõ)', () => {
  it('→ sang kế tiếp, ← quay lại; có Alt, đang gõ trong ô nhập, hoặc có hộp thoại thì bỏ qua', async () => {
    renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2, 3]),
      ...readyAll([1, 2, 3]),
    });
    await productHeading('Áo 1');
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    const input = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 1' })).toBeInTheDocument();
    dialog.remove();
    input.remove();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await productHeading('Áo 2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await productHeading('Áo 1');
  });
});

describe('con trỏ cả hai chiều và tải lại (AC-11, AC-17, R8)', () => {
  it('hết danh sách đã tải thì lấy trang kế bằng after=nextCursor, không lặp, không sót', async () => {
    const { user, calls } = renderRoom({
      'GET /try-on/categories/c1/products': (_body, config) =>
        config.params?.after === 'cur1'
          ? page([4, 5, 6], { prevCursor: 'back1' })
          : page([1, 2, 3], { nextCursor: 'cur1' }),
      ...readyAll([1, 2, 3, 4, 5, 6]),
    });
    await productHeading('Áo 1');
    for (const name of ['Áo 2', 'Áo 3', 'Áo 4']) {
      await user.click(nextButton());
      await productHeading(name);
    }
    const afterCalls = calls.filter((c) => c.params?.after);
    expect(afterCalls).toHaveLength(1);
    expect(afterCalls[0].params).toEqual({ after: 'cur1' });
  });

  it('mở bằng URL có product: tải ?at=, ở đúng sản phẩm đó; mũi tên trái dùng before=prevCursor', async () => {
    const { user, calls } = renderRoom(
      {
        'GET /try-on/categories/c1/products': (_body, config) => {
          if (config.params?.before === 'back1') {
            return page([1, 2], { nextCursor: 'x' });
          }
          return page([3, 4], {
            prevCursor: 'back1',
            anchor: { found: true, deleted: false },
          });
        },
        ...readyAll([1, 2, 3, 4]),
      },
      '/try-on?category=c1&product=p3',
    );
    await productHeading('Áo 3');
    expect(calls.find((c) => c.key === 'GET /try-on/categories/c1/products').params).toEqual({
      at: 'p3',
    });
    await user.click(prevButton());
    await productHeading('Áo 2');
    expect(calls.some((c) => c.params?.before === 'back1')).toBe(true);
  });

  it('tải lại trang khi job đang chạy: gắn vào job đó, không POST job thứ hai (AC-17)', async () => {
    const { calls } = renderRoom(
      {
        'GET /try-on/categories/c1/products': page([3], {
          anchor: { found: true, deleted: false },
        }),
        'GET /try-on/products/p3/result': ok({
          state: 'pending',
          job: { id: 'j3', status: 'running' },
        }),
        'GET /try-on/jobs/j3': ok({
          job: { id: 'j3', productId: 'p3', purpose: 'display', status: 'running' },
        }),
        // Lệnh nâng thành display (flows/tryon-prefetch.md): backend gắn lại đúng job đó.
        'POST /try-on/products/p3/jobs': ok({
          state: 'pending',
          job: { id: 'j3', status: 'running' },
        }),
      },
      '/try-on?category=c1&product=p3',
    );
    await productHeading('Áo 3');
    expect(await screen.findByText('Đang tạo ảnh bạn mặc sản phẩm này…')).toBeInTheDocument();
    await waitFor(() => expect(postsTo(calls)).toHaveLength(1), { timeout: 2000 });
    expect(postsTo(calls)[0].body).toEqual({ purpose: 'display' });
  });

  it('product trên URL không thuộc danh mục: về sản phẩm đầu, không báo lỗi (E6)', async () => {
    const { router } = renderRoom(
      {
        'GET /try-on/categories/c1/products': page([1, 2], {
          anchor: { found: false, deleted: false },
        }),
        ...readyAll([1, 2]),
      },
      '/try-on?category=c1&product=lạ',
    );
    await productHeading('Áo 1');
    await waitFor(() => expect(router.state.location.search).toBe('?category=c1&product=p1'));
  });

  it('product trên URL hỏng định dạng (400): mở trang đầu im lặng', async () => {
    renderRoom(
      {
        'GET /try-on/categories/c1/products': (_body, config) =>
          config.params?.at ? fail(400, 'VALIDATION_ERROR') : page([1, 2]),
        ...readyAll([1, 2]),
      },
      '/try-on?category=c1&product=%25%25',
    );
    await productHeading('Áo 1');
    expect(
      screen.queryByText('Không tải được sản phẩm. Vui lòng thử lại.'),
    ).not.toBeInTheDocument();
  });
});

describe('lỗi điều hướng (AC-12, AC-13, E3, E8)', () => {
  it('S15: tải sản phẩm kế lỗi thì ở lại sản phẩm hiện tại, báo, Thử lại rồi chuyển được', async () => {
    let afterCalls = 0;
    const { user } = renderRoom({
      'GET /try-on/categories/c1/products': (_body, config) => {
        if (!config.params?.after) return page([1], { nextCursor: 'cur1' });
        afterCalls += 1;
        return afterCalls <= 2 ? fail(500, 'INTERNAL_ERROR') : page([2]);
      },
      ...readyAll([1, 2]),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    expect(await screen.findByText('Không tải được sản phẩm tiếp theo.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await productHeading('Áo 2');
    expect(screen.queryByText('Không tải được sản phẩm tiếp theo.')).not.toBeInTheDocument();
  });

  it('S14: sản phẩm kế bị xóa thì báo kèm nút chuyển tiếp, không tự chuyển, không POST; nút dẫn tới sản phẩm sau nó', async () => {
    const { user, calls } = renderRoom({
      'GET /try-on/categories/c1/products': (_body, config) =>
        config.params?.at === 'p2'
          ? page([3], { anchor: { found: true, deleted: true }, nextCursor: 'c9' })
          : config.params?.after === 'c9'
            ? page([4])
            : page([1, 2, 3]),
      ...readyAll([1, 3, 4]),
      'GET /try-on/products/p2/result': fail(404, 'NOT_FOUND'),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    expect(await screen.findByText('Sản phẩm này không còn bán.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Áo 2' })).toBeInTheDocument();
    expect(prevButton()).not.toHaveAttribute('aria-disabled'); // mũi tên vẫn dùng được (AC-14)
    await user.click(screen.getByRole('button', { name: 'Xem sản phẩm tiếp theo' }));
    await productHeading('Áo 3');
    expect(postsTo(calls)).toHaveLength(0);
    expect(nextButton()).toHaveFocus();
  });

  it('S14 khi mở bằng URL: sản phẩm đã xóa thì báo, nút chuyển sang sản phẩm kế tiếp theo con trỏ', async () => {
    const { user } = renderRoom(
      {
        'GET /try-on/categories/c1/products': (_body, config) =>
          config.params?.at === 'p2'
            ? page([3], { anchor: { found: true, deleted: true } })
            : page([3]),
        ...readyAll([3]),
      },
      '/try-on?category=c1&product=p2',
    );
    expect(await screen.findByText('Sản phẩm này không còn bán.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xem sản phẩm tiếp theo' }));
    await productHeading('Áo 3');
  });

  it('sản phẩm đã xóa và không còn sản phẩm nào sau nó: nút đổi thành "Danh mục khác"', async () => {
    renderRoom({
      'GET /try-on/categories/c1/products': page([1]),
      'GET /try-on/products/p1/result': fail(404, 'NOT_FOUND'),
    });
    expect(await screen.findByText('Sản phẩm này không còn bán.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Xem sản phẩm tiếp theo' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Danh mục khác' }).length).toBeGreaterThan(0);
  });

  it('E5, AC-13: danh mục bị xóa lúc bấm tiếp thì báo và về danh sách danh mục, không lỗi', async () => {
    let categoryCalls = 0;
    const { user } = renderRoom({
      'GET /try-on/categories': () => {
        categoryCalls += 1;
        return ok({
          categories:
            categoryCalls === 1 ? CATEGORIES : [{ id: 'c2', name: 'Váy', productCount: 1 }],
        });
      },
      'GET /try-on/categories/c1/products': (_body, config) =>
        config.params?.after ? fail(404, 'NOT_FOUND') : page([1], { nextCursor: 'cur1' }),
      ...readyAll([1]),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    expect(await screen.findByText('Danh mục không còn tồn tại.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Áo thun, 6 sản phẩm' })).not.toBeInTheDocument(),
    );
  });

  it('AC-14: lỗi ở một sản phẩm không chặn mũi tên; sản phẩm sau không mang lỗi của sản phẩm trước', async () => {
    const { user } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2]),
      'GET /try-on/products/p1/result': ok({ state: 'blocked', errorCode: 'TRYON_BLOCKED' }),
      'GET /try-on/products/p2/result': ok({ state: 'ready', image: IMAGE }),
    });
    expect(
      await screen.findByText('Không thể tạo ảnh thử đồ với sản phẩm này.'),
    ).toBeInTheDocument();
    await user.click(nextButton());
    await screen.findByAltText('Ảnh bạn mặc Áo 2, do AI tạo');
    expect(
      screen.queryByText('Không thể tạo ảnh thử đồ với sản phẩm này.'),
    ).not.toBeInTheDocument();
  });

  it('AC-15: hết lượt vẫn lướt được: ảnh đã có hiện, sản phẩm chưa có thì báo hết lượt và không POST', async () => {
    const exhausted = {
      ...STATE,
      quota: { ...STATE.quota, remaining: 0, held: 0, dailyUsed: 20 },
    };
    const { user, calls } = renderRoom({
      'GET /try-on/state': ok(exhausted),
      'GET /try-on/categories/c1/products': page([1, 2]),
      'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
      'GET /try-on/products/p2/result': ok({ state: 'none' }),
    });
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    await user.click(nextButton());
    await productHeading('Áo 2');
    expect(await screen.findAllByText(/Bạn đã dùng hết lượt tạo ảnh/)).not.toHaveLength(0);
    expect(postsTo(calls)).toHaveLength(0);
    await user.click(prevButton());
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
  });

  it('AC-16: consent hết hiệu lực khi bấm tiếp thì gỡ ảnh khỏi màn hình và hiện cổng consent', async () => {
    let stateCalls = 0;
    const { user } = renderRoom({
      'GET /try-on/state': () => {
        stateCalls += 1;
        return ok(
          stateCalls === 1
            ? STATE
            : {
                ...STATE,
                consent: {
                  ...STATE.consent,
                  accepted: false,
                  withdrawnAt: '2026-11-06T03:00:00.000Z',
                },
              },
        );
      },
      'GET /try-on/categories/c1/products': page([1, 2]),
      'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
      'GET /try-on/products/p2/result': fail(403, 'TRYON_CONSENT_REQUIRED'),
    });
    await screen.findByAltText('Ảnh bạn mặc Áo 1, do AI tạo');
    await user.click(nextButton());
    expect(
      await screen.findByText(
        'Đồng ý gửi ảnh của bạn không còn hiệu lực, nên ảnh thử đồ đã được gỡ khỏi màn hình.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/Ảnh bạn mặc/)).not.toBeInTheDocument();
    expect(within(document.body).queryByRole('button', { name: 'Sản phẩm tiếp theo' })).toBeNull();
  });
});

describe('không rò rỉ', () => {
  it('mũi tên và ảnh thử đồ không ghi gì vào localStorage hay sessionStorage', async () => {
    const { user } = renderRoom({
      'GET /try-on/categories/c1/products': page([1, 2]),
      ...readyAll([1, 2]),
    });
    await productHeading('Áo 1');
    await user.click(nextButton());
    await screen.findByAltText('Ảnh bạn mặc Áo 2, do AI tạo');
    expect(sessionStorage.length).toBe(0);
    expect(Object.keys(localStorage)).toHaveLength(1); // chỉ token
  });
});
