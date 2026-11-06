import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Mặc định `findBy*`/`waitFor` chỉ chờ 1 giây: máy bận thì test fail dù app đúng.
configure({ asyncUtilTimeout: 5000 });

// jsdom không cài `scrollTo` (chỉ in cảnh báo "Not implemented").
window.scrollTo = () => {};

// Vitest không bật globals nên RTL không tự cleanup.
afterEach(cleanup);
