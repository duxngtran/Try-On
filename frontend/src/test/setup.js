import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom không cài `scrollTo` (chỉ in cảnh báo "Not implemented").
window.scrollTo = () => {};

// Vitest không bật globals nên RTL không tự cleanup.
afterEach(cleanup);
