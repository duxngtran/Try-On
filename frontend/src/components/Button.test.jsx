import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.jsx';

describe('Button: busy và loading (D-160)', () => {
  it('busy: aria-busy + aria-disabled, không disabled, vẫn giữ focus, chặn click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button busy loadingText="Đang thêm…" onClick={onClick}>
        Thêm
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Đang thêm…' });
    button.focus();
    await user.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading cũ vẫn dùng thuộc tính disabled, không đổi hành vi của những nơi đang dùng', () => {
    render(
      <Button loading loadingText="Đang gửi…">
        Gửi
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Đang gửi…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('mặc định bấm được và không có thuộc tính trạng thái nào', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Thêm</Button>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thêm' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled');
  });
});
