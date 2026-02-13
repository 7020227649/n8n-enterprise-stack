
const axios = require("axios");
const axiosRetry = require("axios-retry");
const config = require("../config");
const { validateWorkflow, validateWorkflows, validateExecutions } = require("../utils/validators");

const api = axios.create({
  baseURL: `${config.n8n.baseURL}/rest`,
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

// Request Interceptor: Inject Credentials (API Key OR Basic Auth)
api.interceptors.request.use(reqConfig => {
  try {
    const state = require("../utils/state"); // Dynamic import
    // 1. Try Env Var (Always plain text)
    let apiKey = config.n8n.apiKey;

    // 2. Try State (Might be encrypted)
    if (!apiKey) {
      const createHash = require("crypto").createHash;
      const storedValue = state.get("n8nApiKey");

      // state.get() attempts to decrypt, but let's double check
      if (storedValue && storedValue.startsWith("enc:")) {
        // If state.get() returned it starting with enc:, it failed to decrypt internaly
        // or logic in state.js is bypassed. Let's try to decrypt manually.
        const { decrypt } = require("../utils/security");
        apiKey = decrypt(storedValue);
      } else {
        apiKey = storedValue;
      }
    }

    // 3. Trim whatever we got
    if (apiKey) apiKey = apiKey.trim();

    // 4. Validate Key Length (Fix for corrupted/encrypted keys)
    if (apiKey && apiKey.length > 60) {
      console.warn(`[n8n API] Detected invalid API Key length (${apiKey.length} chars). Ignoring it to use Basic Auth fallback.`);
      apiKey = null;
    }

    if (apiKey) {
      // ─── Mode 1: API Key (Public API) ───
      reqConfig.headers["X-N8N-API-KEY"] = apiKey;

      // Switch to Public API endpoint if we were using Internal API
      if (reqConfig.baseURL && reqConfig.baseURL.endsWith("/rest")) {
        reqConfig.baseURL = reqConfig.baseURL.replace("/rest", "/api/v1");
      }
    } else if (config.n8n.user && config.n8n.pass) {
      // ─── Mode 2: Basic Auth (Internal API) ───
      // Only apply if no API Key is present
      reqConfig.auth = {
        username: config.n8n.user,
        password: config.n8n.pass
      };
    }

    console.log(`[n8n API] Requesting: ${reqConfig.method.toUpperCase()} ${reqConfig.baseURL}${reqConfig.url}`);
  } catch (err) {
    console.warn("Failed to inject credentials:", err.message);
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
    // Public API v1.  Modern n8n requires session-cookie auth (login first).

    const baseURL = config.n8n.baseURL;

    // Strategy 1: Login via /rest/login, then GET /rest/settings with cookie
    if (config.n8n.user && config.n8n.pass) {
      try {
        // n8n login expects email + password (N8N_USER is typically the email)
        const loginRes = await axios.post(`${baseURL}/rest/login`, {
          email: config.n8n.user,
          password: config.n8n.pass,
        }, { timeout: 10000 });

        // Extract session cookie from Set-Cookie header
        const cookies = loginRes.headers["set-cookie"];
        if (cookies) {
          const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
          const settingsRes = await axios.get(`${baseURL}/rest/settings`, {
            headers: { Cookie: cookieStr },
            timeout: 10000,
          });
          return settingsRes.data?.data || settingsRes.data;
        }
      } catch (err) {
        console.warn("[n8n API] Settings via session login failed:", err.message);
      }
    }

    // Strategy 2: Try Basic Auth (works on older n8n versions)
    if (config.n8n.user && config.n8n.pass) {
      try {
        const res = await axios.get(`${baseURL}/rest/settings`, {
          auth: { username: config.n8n.user, password: config.n8n.pass },
          timeout: 10000,
        });
        return res.data?.data || res.data;
      } catch (err) {
        console.warn("[n8n API] Settings via Basic Auth failed:", err.message);
      }
    }

    // Strategy 3: No-auth request (n8n returns partial settings without auth,
    //             including the version in some configurations)
    try {
      const res = await axios.get(`${baseURL}/rest/settings`, {
        timeout: 10000,
      });
      return res.data?.data || res.data;
    } catch (err) {
      console.warn("[n8n API] Settings without auth failed:", err.message);
    }

    // Nothing worked — return a minimal object so callers don't crash
    return {};
  },
};
