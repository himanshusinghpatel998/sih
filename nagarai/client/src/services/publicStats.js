import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

// Real seed-data-accurate fallback, used if the live endpoint is unreachable
// so the landing page never renders a blank/zero stat row.
export const FALLBACK_STATS = { bins: 154, blocks: 5, resolved: 1208 };

export async function getPublicStats() {
  try {
    const res = await axios.get(`${baseURL}/public/stats`);
    return res.data;
  } catch {
    return FALLBACK_STATS;
  }
}
