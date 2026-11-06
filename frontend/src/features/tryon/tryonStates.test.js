import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import {
  formatDateVn,
  formatPriceVnd,
  formatResetMoment,
  lowQuotaPeriod,
  pickQuotaReset,
} from './tryonFormat.js';
import {
  classifyError,
  describeOverlay,
  overlayForBlocked,
  overlayForJobError,
} from './tryonStates.js';

const err = (status, code, details) =>
  new ApiError({ status, code, message: 'MESSAGE-CUA-SERVER', details });

describe('classifyError: bảng mã lỗi -> trạng thái (try-on-states.md mục 4.1)', () => {
  const cases = [
    // [ngữ cảnh, lỗi, kết quả mong đợi]
    ['result', err(403, 'TRYON_CONSENT_REQUIRED'), { type: 'gate', gate: 'consent' }],
    ['create', err(403, 'TRYON_CONSENT_REQUIRED'), { type: 'gate', gate: 'consent' }],
    [
      'result',
      err(409, 'PROFILE_INCOMPLETE', { missing: ['photo', 'measurements'] }),
      { type: 'gate', gate: 'profile', missing: ['photo', 'measurements'] },
    ],
    ['create', err(409, 'PROFILE_INCOMPLETE'), { type: 'gate', gate: 'profile', missing: [] }],
    ['poll', err(403, 'TRYON_CONSENT_REQUIRED'), { type: 'gate', gate: 'consent' }],
    ['result', err(404, 'NOT_FOUND'), { type: 'overlay', id: 'deleted' }],
    ['create', err(404, 'NOT_FOUND'), { type: 'overlay', id: 'deleted' }],
    ['poll', err(404, 'NOT_FOUND'), { type: 'job-gone' }],
    ['result', err(500, 'INTERNAL_ERROR'), { type: 'overlay', id: 'imageError' }],
    ['create', err(500, 'INTERNAL_ERROR'), { type: 'overlay', id: 'failed' }],
    ['create', err(400, 'VALIDATION_ERROR'), { type: 'overlay', id: 'failed' }],
    ['create', err(503, 'TRYON_UNAVAILABLE'), { type: 'overlay', id: 'paused' }],
    [
      'create',
      err(429, 'TRYON_QUOTA_EXCEEDED', { scope: 'day', resetsAt: 'D' }),
      { type: 'overlay', id: 'quotaDay', data: { scope: 'day', resetsAt: 'D' } },
    ],
    [
      'create',
      err(429, 'TRYON_QUOTA_EXCEEDED', { scope: 'month', resetsAt: 'M' }),
      { type: 'overlay', id: 'quotaMonth', data: { scope: 'month', resetsAt: 'M' } },
    ],
    [
      'create',
      err(429, 'TRYON_QUOTA_EXCEEDED', { scope: 'pending', retryAfterSeconds: 15, resetsAt: null }),
      { type: 'overlay', id: 'quotaPending', data: { retryAfterSeconds: 15 } },
    ],
    [
      'create',
      err(429, 'TOO_MANY_REQUESTS', { retryAfterSeconds: 5 }),
      { type: 'overlay', id: 'throttled', data: { retryAfterSeconds: 5 } },
    ],
    [
      'create',
      err(429, 'TOO_MANY_REQUESTS'),
      { type: 'overlay', id: 'throttled', data: { retryAfterSeconds: null } },
    ],
    [
      'poll',
      err(429, 'TOO_MANY_REQUESTS', { retryAfterSeconds: 7 }),
      { type: 'poll-slow', retryAfterSeconds: 7 },
    ],
    ['poll', err(500, 'INTERNAL_ERROR'), { type: 'transient' }],
    ['poll', err(0, 'NETWORK_ERROR'), { type: 'transient' }],
    ['result', err(0, 'NETWORK_ERROR'), { type: 'offline' }],
    ['create', err(0, 'NETWORK_ERROR'), { type: 'offline' }],
    ['create', err(0, 'CANCELED'), { type: 'canceled' }],
  ];
  it.each(cases)('%s: %o', (context, error, expected) => {
    expect(classifyError(error, context)).toEqual(expected);
  });

  it('429 hết lượt thiếu scope coi như hết lượt ngày (không crash)', () => {
    expect(classifyError(err(429, 'TRYON_QUOTA_EXCEEDED'), 'create')).toMatchObject({
      id: 'quotaDay',
    });
  });
});

describe('câu chữ lớp phủ (D-119: không bao giờ hiển thị error.message của server)', () => {
  const ids = [
    'timeout',
    'failed',
    'blocked',
    'photo',
    'paused',
    'quotaDay',
    'quotaMonth',
    'quotaPending',
    'throttled',
    'imageError',
    'deleted',
  ];
  it.each(ids)('%s có câu chữ cố định, không chứa message của server', (id) => {
    const overlay = describeOverlay(id, { resetsAt: '2026-11-06T17:00:00.000Z' });
    expect(JSON.stringify(overlay)).not.toContain('MESSAGE-CUA-SERVER');
    expect(overlay.body).toBeTruthy();
  });

  it('S7 bị bộ lọc an toàn không có nút Thử lại (R9); S8 dẫn tới Hồ sơ', () => {
    expect(describeOverlay('blocked').action).toBeUndefined();
    expect(describeOverlay('photo').action).toMatchObject({ kind: 'profile' });
  });

  it('S10, S10b: nêu đúng thời điểm có lượt mới theo giờ Việt Nam', () => {
    expect(describeOverlay('quotaDay', { resetsAt: '2026-11-06T17:00:00.000Z' }).body).toBe(
      'Bạn đã dùng hết lượt tạo ảnh hôm nay. Lượt mới có sau 00:00 ngày 07/11. Các ảnh đã tạo vẫn xem được.',
    );
    expect(describeOverlay('quotaMonth', { resetsAt: '2026-11-30T17:00:00.000Z' }).body).toBe(
      'Bạn đã dùng hết lượt tạo ảnh tháng này. Lượt mới có sau 00:00 ngày 01/12. Các ảnh đã tạo vẫn xem được.',
    );
  });

  it('S10c, S11 khóa nút theo đếm ngược; S11 thiếu retryAfterSeconds thì 10 giây (D-34)', () => {
    expect(describeOverlay('quotaPending', { retryAfterSeconds: 15 }).action.lockSeconds).toBe(15);
    expect(describeOverlay('throttled', { retryAfterSeconds: null }).action.lockSeconds).toBe(10);
    expect(describeOverlay('throttled', { retryAfterSeconds: 3 }).action.lockSeconds).toBe(3);
  });

  it('mã job lạ coi là lỗi tạm thời; blocked mang mã tư thế thì S8', () => {
    expect(overlayForJobError('TRYON_SOMETHING_NEW')).toBe('failed');
    expect(overlayForJobError(undefined)).toBe('failed');
    expect(overlayForBlocked('TRYON_PHOTO_UNUSABLE')).toBe('photo');
    expect(overlayForBlocked('TRYON_BLOCKED')).toBe('blocked');
    expect(() => describeOverlay('khong-co')).toThrow();
  });
});

describe('định dạng', () => {
  it('thời điểm theo giờ Việt Nam, không phụ thuộc múi giờ máy, nửa đêm là 00 chứ không phải 24', () => {
    expect(formatResetMoment('2026-11-06T17:00:00.000Z')).toBe('00:00 ngày 07/11');
    expect(formatResetMoment('2026-12-31T17:00:00.000Z')).toBe('00:00 ngày 01/01');
    expect(formatResetMoment(null)).toBeNull();
    expect(formatResetMoment('không phải ngày')).toBeNull();
  });

  it('ngày consent và giá tiền theo vi-VN', () => {
    expect(formatDateVn('2026-11-06T02:00:00.000Z')).toBe('06/11/2026');
    expect(formatDateVn('2026-11-06T20:00:00.000Z')).toBe('07/11/2026'); // đã sang ngày mới ở Việt Nam
    expect(formatPriceVnd(199000).replace(/\s/g, ' ')).toBe('199.000 ₫');
  });

  it('mốc hết lượt: tháng nếu đã hết lượt tháng, ngược lại ngày; nhãn "tháng này" khi giới hạn tháng thấp hơn', () => {
    const base = {
      dailyLimit: 20,
      dailyUsed: 20,
      dailyResetsAt: 'D',
      monthlyLimit: 100,
      monthlyUsed: 40,
      monthlyResetsAt: 'M',
    };
    expect(pickQuotaReset(base)).toEqual({ scope: 'day', resetsAt: 'D' });
    expect(pickQuotaReset({ ...base, monthlyUsed: 100 })).toEqual({
      scope: 'month',
      resetsAt: 'M',
    });
    expect(lowQuotaPeriod({ ...base, dailyUsed: 17, monthlyUsed: 99 })).toBe('tháng này');
    expect(lowQuotaPeriod({ ...base, dailyUsed: 17, monthlyUsed: 40 })).toBe('hôm nay');
  });
});
