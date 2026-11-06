import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { USER, fail, ok, renderApp } from '../../test/renderApp.jsx';
import { TRYON_PROVIDER } from '../tryon/tryonConfig.js';

// jsdom không tải ảnh thật: giả lập bước đọc kích thước.
vi.mock('./imageLoader.js', () => ({
  loadImage: vi.fn(async () => ({ url: 'blob:preview-1', width: 800, height: 1400 })),
}));

const PHOTO = {
  url: 'https://storage.test/old.jpg?token=a',
  expiresAt: '2099-01-01T00:00:00.000Z',
  version: 1,
  updatedAt: '2026-11-04T08:00:00.000Z',
};
const complete = {
  heightCm: 165,
  weightKg: 50,
  photo: PHOTO,
  consent: { accepted: true, acceptedAt: '2026-11-04T07:00:00.000Z', version: 1 },
  profileCompleted: true,
  missing: [],
};
const aiState = (consent) => ({
  profile: { completed: true, missing: [] },
  consent: {
    version: 1,
    requiredVersion: 1,
    accepted: false,
    acceptedAt: null,
    withdrawnAt: null,
    ...consent,
  },
});
const AGREED = { accepted: true, acceptedAt: '2026-11-06T02:00:00.000Z' };

const renderProfile = (routes) =>
  renderApp('/profile', {
    token: 'jwt',
    routes: {
      'GET /auth/me': ok({ user: USER }),
      'GET /profile': ok({ profile: complete }),
      'GET /try-on/state': ok(aiState(AGREED)),
      ...routes,
    },
  });

const aiCard = async () => screen.findByRole('region', { name: 'Thử đồ bằng AI' });

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});

describe('Hồ sơ: mục "Thử đồ bằng AI" (D-116)', () => {
  it('đã đồng ý: badge, ngày theo giờ Việt Nam, mô tả nêu tên bên nhận từ hằng cấu hình, có nút Rút đồng ý', async () => {
    renderProfile();
    const card = await aiCard();
    await within(card).findByText('Đã đồng ý');
    expect(card).toHaveTextContent('Từ ngày 06/11/2026.');
    expect(card).toHaveTextContent(`ảnh toàn thân của bạn được gửi tới ${TRYON_PROVIDER.name}`);
    expect(
      within(card).getByRole('button', { name: 'Rút đồng ý gửi ảnh cho dịch vụ AI' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['chưa từng đồng ý', {}, 'Chưa đồng ý', 'Bạn sẽ được hỏi khi vào Phòng thử đồ.', true, false],
    [
      'đã rút',
      { acceptedAt: '2026-11-04T02:00:00.000Z', withdrawnAt: '2026-11-06T02:00:00.000Z' },
      'Đã rút đồng ý',
      'Từ ngày 06/11/2026. Ảnh thử đồ cũ đã được xóa. Bạn sẽ được hỏi lại khi vào Phòng thử đồ.',
      true,
      false,
    ],
    [
      'điều khoản đã cập nhật',
      { acceptedAt: '2026-11-04T02:00:00.000Z', version: 0 },
      'Cần đồng ý lại',
      'Điều khoản gửi ảnh đã cập nhật. Ảnh thử đồ đã tạo vẫn được giữ và sẽ hiện lại sau khi bạn đồng ý lại.',
      true,
      true,
    ],
  ])('%s', async (_label, consent, badge, text, hasRoomLink, canWithdraw) => {
    renderProfile({ 'GET /try-on/state': ok(aiState(consent)) });
    const card = await aiCard();
    expect(await within(card).findByText(badge)).toBeInTheDocument();
    expect(within(card).getByText(text)).toBeInTheDocument();
    expect(Boolean(within(card).queryByRole('link', { name: 'Vào phòng thử đồ' }))).toBe(
      hasRoomLink,
    );
    expect(Boolean(within(card).queryByRole('button', { name: /Rút đồng ý/ }))).toBe(canWithdraw);
  });

  it('lỗi tải /state: báo riêng trong mục và có Thử lại, phần còn lại của Hồ sơ vẫn dùng được', async () => {
    let calls = 0;
    const { user } = renderProfile({
      'GET /try-on/state': () => {
        calls += 1;
        return calls === 1 ? fail(500, 'INTERNAL_ERROR') : ok(aiState(AGREED));
      },
    });
    const card = await aiCard();
    expect(await within(card).findByText('Không tải được trạng thái đồng ý.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chiều cao')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Thử lại' }));
    expect(await within(card).findByText('Đã đồng ý')).toBeInTheDocument();
  });

  it('hộp thoại rút: nêu đủ hậu quả, nói rõ phần đã gửi không thu hồi được, Hủy nhận focus và không gọi API', async () => {
    const { user, calls } = renderProfile();
    await user.click(await screen.findByRole('button', { name: /Rút đồng ý gửi ảnh/ }));
    const dialog = screen.getByRole('dialog', { name: 'Rút đồng ý gửi ảnh?' });
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
    expect(dialog).toHaveTextContent('Chúng tôi dừng gửi ảnh của bạn tới dịch vụ AI.');
    expect(dialog).toHaveTextContent('Mọi ảnh thử đồ đã tạo của bạn sẽ bị xóa khỏi Try-on.');
    expect(dialog).toHaveTextContent('Ảnh hồ sơ và số đo của bạn được giữ nguyên.');
    expect(dialog).toHaveTextContent(
      `Không thu hồi được phần đã gửi: những ảnh đã được gửi tới ${TRYON_PROVIDER.name} trước đó không thể xóa từ phía Try-on.`,
    );
    expect(dialog).toHaveTextContent('lượt tạo ảnh đó vẫn bị tính');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(calls.some((c) => c.key === 'DELETE /try-on/consent')).toBe(false);
  });

  it('rút thành công: mục chuyển "Đã rút", toast, focus về h2, hộp thoại đóng (AC-10)', async () => {
    const { user, calls } = renderProfile({
      'DELETE /try-on/consent': ok(
        aiState({
          accepted: false,
          acceptedAt: '2026-11-06T02:00:00.000Z',
          withdrawnAt: '2026-11-06T03:00:00.000Z',
        }),
      ),
    });
    await user.click(await screen.findByRole('button', { name: /Rút đồng ý gửi ảnh/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Rút đồng ý' }),
    );
    expect(await screen.findByText('Đã rút đồng ý')).toBeInTheDocument();
    expect(calls.filter((c) => c.key === 'DELETE /try-on/consent')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('Đã rút đồng ý. Các ảnh thử đồ của bạn đang được xóa.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Thử đồ bằng AI' })).toHaveFocus();
    // Ảnh hồ sơ và số đo không bị đụng tới.
    expect(calls.some((c) => c.key === 'DELETE /profile/photo')).toBe(false);
  });

  it('rút lỗi: hộp thoại vẫn mở, báo lỗi, KHÔNG nói "đã rút"; 429 khóa nút theo đếm ngược', async () => {
    const { user } = renderProfile({
      'DELETE /try-on/consent': fail(500, 'INTERNAL_ERROR', 'chi tiết kỹ thuật'),
    });
    await user.click(await screen.findByRole('button', { name: /Rút đồng ý gửi ảnh/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Rút đồng ý' }),
    );
    expect(await screen.findByText('Chưa rút được đồng ý, vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.queryByText(/chi tiết kỹ thuật/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Đã rút đồng ý')).not.toBeInTheDocument();
  });

  it('rút 429: cảnh báo và nút khóa mềm', async () => {
    const { user } = renderProfile({
      'DELETE /try-on/consent': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 20 }),
    });
    await user.click(await screen.findByRole('button', { name: /Rút đồng ý gửi ảnh/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Rút đồng ý' }),
    );
    expect(
      await screen.findByText('Bạn thao tác quá nhanh, vui lòng thử lại sau.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Rút đồng ý sau \d+ giây/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Hồ sơ: câu chữ về ảnh thử đồ và việc gửi ảnh (D-93, D-115)', () => {
  const openDelete = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Xóa ảnh' }));
    return screen.getByRole('dialog', { name: 'Xóa ảnh?' });
  };

  it('xóa ảnh: nêu ảnh thử đồ cũng bị xóa, bỏ chữ "vĩnh viễn", có câu không thu hồi khi đã từng đồng ý', async () => {
    const { user } = renderProfile();
    const dialog = await openDelete(user);
    expect(dialog).toHaveTextContent('Ảnh toàn thân sẽ bị xóa khỏi Try-on.');
    expect(dialog).toHaveTextContent('Các ảnh thử đồ đã tạo từ ảnh này cũng sẽ bị xóa');
    expect(dialog).toHaveTextContent(
      'Việc xóa không thu hồi được những ảnh đã được gửi tới dịch vụ AI trước đây.',
    );
    expect(dialog.textContent).not.toMatch(/vĩnh viễn/);
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
  });

  it('chưa từng đồng ý gửi ảnh thì bỏ câu không thu hồi (chưa có gì gửi đi); không đọc được /state thì vẫn nói (an toàn)', async () => {
    const first = renderProfile({ 'GET /try-on/state': ok(aiState({})) });
    await within(await aiCard()).findByText('Chưa đồng ý');
    expect(await openDelete(first.user)).not.toHaveTextContent('không thu hồi được');
    first.unmount();

    const second = renderProfile({ 'GET /try-on/state': fail(500, 'INTERNAL_ERROR') });
    await within(await aiCard()).findByText('Không tải được trạng thái đồng ý.');
    expect(await openDelete(second.user)).toHaveTextContent('không thu hồi được');
  });

  it('xóa xong: toast nói ảnh thử đồ cũng đã bị xóa', async () => {
    const { user } = renderProfile({
      'DELETE /profile/photo': ok({
        profile: { ...complete, photo: null, profileCompleted: false, missing: ['photo'] },
      }),
    });
    const dialog = await openDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Xóa ảnh' }));
    expect(
      await screen.findByText('Đã xóa ảnh. Các ảnh thử đồ của bạn cũng đã được xóa.'),
    ).toBeInTheDocument();
  });

  it('thay ảnh: ghi chú ảnh cũ bị xóa và tốn lượt hiện ở bước xem trước, gắn vào nút Lưu ảnh; toast sau khi lưu', async () => {
    const { user } = renderProfile({
      'PUT /profile/photo': ok({ profile: { ...complete, photo: { ...PHOTO, version: 2 } } }),
    });
    await user.upload(
      await screen.findByLabelText('Chọn ảnh toàn thân', { selector: 'input' }),
      new File(['x'], 'me.jpg', { type: 'image/jpeg' }),
    );
    const save = await screen.findByRole('button', { name: 'Lưu ảnh' });
    const note =
      'Khi bạn lưu ảnh mới, các ảnh thử đồ cũ sẽ bị xóa và phải tạo lại. Việc này dùng lượt tạo ảnh của bạn.';
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(save).toHaveAccessibleDescription(note);
    await user.click(save);
    expect(
      await screen.findByText('Đã cập nhật ảnh. Các ảnh thử đồ cũ đã được xóa.'),
    ).toBeInTheDocument();
  });

  it('tải ảnh lần đầu: không có ghi chú về ảnh thử đồ cũ (chưa có gì để xóa)', async () => {
    const { user } = renderProfile({
      'GET /profile': ok({
        profile: { ...complete, photo: null, profileCompleted: false, missing: ['photo'] },
      }),
      'PUT /profile/photo': ok({ profile: complete }),
    });
    await user.upload(
      await screen.findByLabelText('Chọn ảnh toàn thân', { selector: 'input' }),
      new File(['x'], 'me.jpg', { type: 'image/jpeg' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Lưu ảnh' }));
    expect(screen.queryByText(/ảnh thử đồ cũ sẽ bị xóa/)).not.toBeInTheDocument();
    expect(await screen.findByText('Đã cập nhật ảnh')).toBeInTheDocument();
  });

  it('nhãn consent lưu ảnh không còn cụm "gửi ảnh tới dịch vụ AI"; modal viết lại đúng D-93', async () => {
    const { user } = renderProfile({
      'GET /profile': ok({
        profile: {
          ...complete,
          photo: null,
          consent: { accepted: false, acceptedAt: null, version: 1 },
        },
      }),
    });
    const label = await screen.findByLabelText(/Tôi đồng ý cho Try-on lưu trữ ảnh này/);
    expect(label).toBeInTheDocument();
    expect(
      screen.getByText(
        /Tôi đồng ý cho Try-on lưu trữ ảnh này để dùng trong hồ sơ của tôi và tạo ảnh thử đồ\. Ảnh chỉ được gửi tới dịch vụ AI khi tôi đồng ý riêng ở Phòng thử đồ\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bao gồm việc gửi ảnh tới dịch vụ AI/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    const dialog = screen.getByRole('dialog', { name: 'Cách chúng tôi dùng ảnh của bạn' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(6);
    expect(dialog).toHaveTextContent(`Ảnh chỉ được gửi tới ${TRYON_PROVIDER.name}`);
    expect(dialog).toHaveTextContent('sau khi bạn đồng ý riêng ở Phòng thử đồ');
    expect(dialog).toHaveTextContent('hết hạn sau 15 phút');
    expect(dialog).toHaveTextContent('không xóa được phần đã được gửi và xử lý trước đó');
    expect(dialog.textContent).not.toMatch(/chỉ bạn xem được/);
  });

  it('banner hồ sơ đầy đủ có nút "Vào phòng thử đồ" dẫn tới /try-on', async () => {
    renderProfile();
    expect(
      await screen.findByRole('link', { name: 'Vào phòng thử đồ', description: '' }),
    ).toHaveAttribute('href', '/try-on');
  });
});

describe('Hồ sơ: neo từ cổng hồ sơ', () => {
  it('#measurements đưa focus vào ô Chiều cao; #photo đưa focus vào card ảnh', async () => {
    const first = renderApp('/profile#measurements', {
      token: 'jwt',
      routes: {
        'GET /auth/me': ok({ user: USER }),
        'GET /profile': ok({ profile: complete }),
        'GET /try-on/state': ok(aiState(AGREED)),
      },
    });
    expect(await screen.findByLabelText('Chiều cao')).toHaveFocus();
    first.unmount();

    renderApp('/profile#photo', {
      token: 'jwt',
      routes: {
        'GET /auth/me': ok({ user: USER }),
        'GET /profile': ok({ profile: complete }),
        'GET /try-on/state': ok(aiState(AGREED)),
      },
    });
    const section = await screen.findByRole('region', { name: 'Ảnh toàn thân' });
    expect(section).toHaveAttribute('id', 'photo');
    await vi.waitFor(() => expect(section).toHaveFocus());
  });
});
