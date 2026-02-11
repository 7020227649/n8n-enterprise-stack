
const axios = require("axios");
const axiosRetry = require("axios-retry");
const config = require("../config");
const { validateWorkflow, validateWorkflows, validateExecutions } = require("../utils/validators");

const api = axios.create({
  baseURL: `${config.n8n.baseURL}/rest`,
  auth: {
    username: config.n8n.user,
    password: config.n8n.pass
  },
  timeout: 30000
});

axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay
});

// Request Interceptor: Inject API Key if available
api.interceptors.request.use(config => {
  try {
    const state = require("../utils/state"); // Dynamic import
    const apiKey = state.get("n8nApiKey");

    if (apiKey) {
      config.headers["X-N8N-API-KEY"] = apiKey;
      // Switch to Public API endpoint if we were using Internal API
      if (config.baseURL && config.baseURL.endsWith("/rest")) {
        config.baseURL = config.baseURL.replace("/rest", "/api/v1");
      }
    }
  } catch (err) {
    console.warn("Failed to inject API Key:", err.message);
  }
  return config;
});

// Log API errors for easier debugging
api.interceptors.response.use(
  response => response,
  error => {
    console.error(`[n8n API] Error ${error.response?.status} on ${error.config?.url}:`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

module.exports = {

  // ─── Workflow CRUD ──────────────────────────────────

  async getAllWorkflows() {
    const res = await api.get("/workflows");
    return validateWorkflows(res.data?.data || res.data);
  },

  async getWorkflow(id) {
    const res = await api.get(`/workflows/${id}`);
    const wf = validateWorkflow(res.data?.data || res.data);
    if (!wf) throw new Error(`Invalid workflow data for ID ${id}`);
    return wf;
  },

  async createWorkflow(data) {
    const res = await api.post("/workflows", data);
    return res.data?.data || res.data;
  },

  async updateWorkflow(id, data) {
    const res = await api.patch(`/workflows/${id}`, data);
    return res.data?.data || res.data;
  },

  async deleteWorkflow(id) {
    const res = await api.delete(`/workflows/${id}`);
    return res.data?.data || res.data;
  },

  // ─── Workflow Activation ────────────────────────────

  async activateWorkflow(id) {
    const res = await api.patch(`/workflows/${id}`, { active: true });
    return res.data?.data || res.data;
  },

  async deactivateWorkflow(id) {
    const res = await api.patch(`/workflows/${id}`, { active: false });
    return res.data?.data || res.data;
  },

  // ─── Workflow Execution ─────────────────────────────

  async executeWorkflow(id) {
    const res = await api.post(`/workflows/${id}/execute`);
    return res.data?.data || res.data;
  },

  // ─── Execution History ──────────────────────────────

  async getExecutions(params = {}) {
    const query = {
      limit: params.limit || 20,
      ...(params.workflowId && { workflowId: params.workflowId }),
      ...(params.status && { status: params.status }),
      ...(params.cursor && { cursor: params.cursor })
    };
    const res = await api.get("/executions", { params: query });
    return validateExecutions(res.data);
  },

  async getExecution(id) {
    const res = await api.get(`/executions/${id}`);
    return res.data?.data || res.data;
  },

  // ─── Stop / Delete Execution ────────────────────────

  async stopExecution(id) {
    const res = await api.post(`/executions/${id}/stop`);
    return res.data?.data || res.data;
  },

  // ─── Credentials ────────────────────────────────────

  async getCredentials() {
    const res = await api.get("/credentials");
    const data = res.data?.data || res.data;
    return Array.isArray(data) ? data : [];
  },

  // ─── Retry Execution ────────────────────────────────

  async retryExecution(id) {
    const res = await api.post(`/executions/${id}/retry`);
    return res.data?.data || res.data;
  },

  // ─── Settings / Version ─────────────────────────────

  async getSettings() {
    const res = await api.get("/settings");
    return res.data?.data || res.data;
  },
};
