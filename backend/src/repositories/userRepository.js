import { getSupabase } from '../config/supabase.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/** Ném khi INSERT vi phạm unique email (đăng ký đồng thời, US-01 E8). */
export class DuplicateEmailError extends Error {
  constructor() {
    super('Email đã tồn tại');
    this.name = 'DuplicateEmailError';
  }
}

const PUBLIC_COLUMNS = 'id, email, role, created_at';
const WITH_HASH_COLUMNS = `${PUBLIC_COLUMNS}, password_hash`;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * Truy cập bảng `users` qua Supabase (service role). Mọi hàm nhận/trả email đã chuẩn hóa.
 * Hàng trả về có dạng snake_case của DB; service chịu trách nhiệm map ra API.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export function createUserRepository(client = getSupabase()) {
  const users = () => client.from('users');

  return {
    /** Có `password_hash` — chỉ dùng cho đăng nhập/seed. */
    async findByEmailWithHash(email) {
      return unwrap(await users().select(WITH_HASH_COLUMNS).eq('email', email).maybeSingle());
    },

    async findById(id) {
      return unwrap(await users().select(PUBLIC_COLUMNS).eq('id', id).maybeSingle());
    },

    async create({ email, passwordHash, role = 'user' }) {
      const { data, error } = await users()
        .insert({ email, password_hash: passwordHash, role })
        .select(PUBLIC_COLUMNS)
        .single();
      if (error?.code === POSTGRES_UNIQUE_VIOLATION) throw new DuplicateEmailError();
      if (error) throw error;
      return data;
    },

    async update(id, { role, passwordHash }) {
      const patch = {};
      if (role !== undefined) patch.role = role;
      if (passwordHash !== undefined) patch.password_hash = passwordHash;
      return unwrap(await users().update(patch).eq('id', id).select(PUBLIC_COLUMNS).single());
    },
  };
}
