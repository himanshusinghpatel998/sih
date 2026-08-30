import axios from 'axios';

// ✅ Use Vite environment variable
const baseURL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : '/api';

const API = axios.create({
  baseURL,
});

// ✅ Attach token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('wms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ================= AUTH =================
export const loginUser = (data) => {
  console.log("Login API:", `${import.meta.env.VITE_API_URL}/api/auth/login`);
  return API.post('/auth/login', data);
};

export const registerUser = (data) => API.post('/auth/register', data);
export const getMe = () => API.get('/auth/me');
export const forgotPasswordApi = (data) => API.post('/auth/forgot-password', data);

// ================= USERS =================
export const getUsers = (role) =>
  API.get('/users', { params: role ? { role } : {} });

export const getUserById = (id) => API.get(`/users/${id}`);
export const createUser = (data) => API.post('/users', data);
export const updateUser = (id, data) => API.put(`/users/${id}`, data);
export const changePassword = (id, data) =>
  API.put(`/users/${id}/password`, data);
export const deleteUserApi = (id) => API.delete(`/users/${id}`);

// ================= COMPLAINTS =================
export const getComplaints = (params) =>
  API.get('/complaints', { params });

export const getComplaintById = (id) =>
  API.get(`/complaints/${id}`);

export const submitComplaint = (data) => {
  if (data instanceof FormData) {
    // Do NOT set Content-Type manually — axios auto-sets it with the correct multipart boundary
    return API.post('/complaints', data);
  }
  return API.post('/complaints', data);
};

export const updateComplaintStatus = (id, data) =>
  API.put(`/complaints/${id}/status`, data);

export const completeComplaintApi = (id, data) => {
  if (data instanceof FormData) {
    // Do NOT set Content-Type manually — axios auto-sets it with the correct multipart boundary
    return API.post(`/complaints/complete/${id}`, data);
  }
  return API.post(`/complaints/complete/${id}`, data);
};

// ================= REWARDS =================
export const getRewards = (params) =>
  API.get('/rewards', { params });

export const addReward = (data) =>
  API.post('/rewards', data);

// ================= STATS =================
export const getDashboardStats = () =>
  API.get('/stats/dashboard');

// ================= STORE =================
export const getStoreItems = () => API.get('/store');

export const redeemStoreItem = (itemId) =>
  API.post('/store/redeem', { itemId });

// ================= ORDERS =================
export const getOrders = (params) =>
  API.get('/orders', { params });

export const getOrderById = (id) =>
  API.get(`/orders/${id}`);

export const updateOrderStatus = (id, data) =>
  API.put(`/orders/${id}`, data);

export const assignOrderApi = (id) =>
  API.post(`/orders/assign/${id}`);

// ================= NOTIFICATIONS =================
export const getNotifications = () => API.get('/notifications');
export const markNotificationRead = (id) => API.put(`/notifications/read/${id}`);
export const markAllNotificationsRead = () => API.put('/notifications/read-all');

// ================= IOT =================
export const getIotBinData = () => API.get('/iot/data');

// ================= NAGARAI ENGINE =================
// Predictions
export const runPredictions = (data = {}) => API.post('/predictions/run', data);
export const getPredictions = (params) => API.get('/predictions', { params });

// Events & spikes
export const getEvents = (params) => API.get('/events', { params });
export const createEvent = (data) => API.post('/events', data);
export const getEventImpact = (id) => API.get(`/events/${id}/impact`);

// Bins
export const getBins = () => API.get('/bins');
export const optimizeBins = () => API.post('/bins/optimize');
export const getBinRecommendations = () => API.get('/bins/recommendations');

// Routes (CVRP)
export const generateRoutes = (data = {}) => API.post('/routes/generate', data);
export const deployRoutes = (data = {}) => API.post('/routes/deploy', data);
export const advanceDay = (data = {}) => API.post('/routes/advance-day', data);
export const getWorkforce = (params) => API.get('/routes/workforce', { params });

// Incidents (closed loop)
export const getIncidents = (params) => API.get('/incidents', { params });
export const createIncident = (data, formData) => API.post('/incidents', data, formData);

// Tasks
export const getTasks = (params) => API.get('/tasks', { params });

// ML
export const getMLStatus = () => API.get('/ml/status');

// Sweeping (predictive dirt-score engine)
export const analyzeSweeping = (data = {}) => API.post('/sweeping/analyze', data);
export const getSweepingNeeds = () => API.get('/sweeping/needs');
export const getSweepingPlan = (data = {}) => API.post('/sweeping/plan', data);
export const deploySweeping = (data = {}) => API.post('/sweeping/deploy', data);

// CCTV (heuristic detection MVP)
export const detectCctvFrame = (formData) =>
  API.post('/cctv/detect', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export default API;