import { ok } from '../utils/response.js';
import { getHealth } from '../services/healthService.js';

export const health = (req, res) => ok(res, getHealth());
