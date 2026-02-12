
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

/**
 * Detect whether we are using API Key auth (Public API) or Basic Auth (Internal).
 * Returns true if API Key is available.
 */
function isApiKeyMode() {
  const state = require("../utils/state"); // Dynamic import
  const apiKey = config.n8n.apiKey || state.get("n8nApiKey");
  return !!apiKey;
}

// Request Interceptor: Inject API Key if available
api.interceptors.request.use(reqConfig => {
  try {
    const state = require("../utils/state"); // Dynamic import
    const apiKey = config.n8n.apiKey || state.get("n8nApiKey");

    if (apiKey) {
      reqConfig.headers["X-N8N-API-KEY"] = apiKey;

      // Remove Basic Auth to prevent conflicts/401
      delete reqConfig.auth;
      if (reqConfig.headers["Authorization"]) {
        delete reqConfig.headers["Authorization"];
      }

      // Switch to Public API endpoint if we were using Internal API
      if (reqConfig.baseURL && reqConfig.baseURL.endsWith("/rest")) {
        reqConfig.baseURL = reqConfig.baseURL.replace("/rest", "/api/v1");
      }
    }
    console.log(`[n8n API] Requesting: ${reqConfig.method.toUpperCase()} ${reqConfig.baseURL}${reqConfig.url}`);
  } catch (err) {
    console.warn("Failed to inject API Key:", err.message);
  }
  return reqConfig;
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
    // Public API v1 uses POST /workflows/:id/run
    // Internal REST API uses POST /workflows/:id/execute
    const endpoint = isApiKeyMode()
      ? `/workflows/${id}/run`
      : `/workflows/${id}/execute`;
    const res = await api.post(endpoint);
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
    // The /settings endpoint only exists on the Internal REST API, NOT the
    // Public API v1.  Always call the internal endpoint directly (bypassing
    // the interceptor that rewrites the base URL in API‑key mode).

    // Strategy 1: Internal REST API with Basic Auth (most reliable)
    if (config.n8n.user && config.n8n.pass) {
      try {
        const res = await axios.get(`${config.n8n.baseURL}/rest/settings`, {
          auth: { username: config.n8n.user, password: config.n8n.pass },
          timeout: 10000,
        });
        return res.data?.data || res.data;
      } catch (err) {
        console.warn("[n8n API] Settings via Basic Auth failed:", err.message);
      }
    }

    // Strategy 2: Internal REST API without auth (works if n8n has no
    //             owner set up yet, or when accessed from localhost/Docker)
    try {
      const res = await axios.get(`${config.n8n.baseURL}/rest/settings`, {
        timeout: 10000,
      });
      return res.data?.data || res.data;
    } catch (err) {
      console.warn("[n8n API] Settings without auth failed:", err.message);
    }

    // Strategy 3: Use the main api instance as a last resort (may fail in
    //             API‑key mode, but worth a try if the above two failed)
    try {
      const res = await api.get("/settings");
      return res.data?.data || res.data;
    } catch (err) {
      console.warn("[n8n API] Settings via api instance failed:", err.message);
    }

    // Nothing worked — return a minimal object so callers don't crash
    return {};
  },
};
