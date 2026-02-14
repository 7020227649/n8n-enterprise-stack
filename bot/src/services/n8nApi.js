
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

// Store session cookie in memory
let sessionCookie = null;
let sessionPromise = null;

/**
 * Perform login to n8n and get a session cookie.
 * Handles race conditions using a promise.
 */
async function getSessionCookie(forceRefresh = false) {
  if (sessionCookie && !forceRefresh) return sessionCookie;

  // If a login is already in progress, return that promise
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      console.log("[n8n API] Authenticating via Session...");
      const loginRes = await axios.post(`${config.n8n.baseURL}/rest/login`, {
        email: config.n8n.user,
        password: config.n8n.pass,
      }, { timeout: 10000 });

      const cookies = loginRes.headers["set-cookie"];
      if (cookies) {
        sessionCookie = cookies.map(c => c.split(";")[0]).join("; ");
        console.log("[n8n API] Session authenticated successfully.");
        return sessionCookie;
      }
      throw new Error("No cookies received from login.");
    } catch (err) {
      console.error("[n8n API] Session login failed:", err.message);
      throw err;
    } finally {
      sessionPromise = null;
    }
  })();

  return sessionPromise;
}

/**
 * Detect whether we are using API Key auth (Public API) or Session Auth (Internal).
 * Returns true if API Key is available.
 */
function isApiKeyMode() {
  const state = require("../utils/state"); // Dynamic import
  const apiKey = config.n8n.apiKey || state.get("n8nApiKey");
  return !!apiKey;
}

// Request Interceptor: Inject Credentials (API Key OR Session Cookie)
api.interceptors.request.use(async reqConfig => {
  try {
    const state = require("../utils/state"); // Dynamic import
    // 1. Try Env Var (Always plain text)
    let apiKey = config.n8n.apiKey;

    // 2. Try State (Might be encrypted)
    if (!apiKey) {
      const storedValue = state.get("n8nApiKey");
      if (storedValue && storedValue.startsWith("enc:")) {
        const { decrypt } = require("../utils/security");
        apiKey = decrypt(storedValue);
      } else {
        apiKey = storedValue;
      }
    }

    // 3. Trim whatever we got
    if (apiKey) apiKey = apiKey.trim();

    // 4. Validate Key Length
    if (apiKey && apiKey.length > 60) {
      console.warn(`[n8n API] Detected invalid API Key length (${apiKey.length} chars). Ignoring it.`);
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
      // ─── Mode 2: Session Auth (Internal API) ───
      try {
        const cookie = await getSessionCookie();
        if (cookie) {
          reqConfig.headers["Cookie"] = cookie;
        }
      } catch (e) {
        // Allow request to proceed (it might fail with 401, which we catch later)
        console.warn("[n8n API] Proceeding without session cookie after login failure.");
      }
    }

    // console.log(`[n8n API] Requesting: ${reqConfig.method.toUpperCase()} ${reqConfig.baseURL}${reqConfig.url}`);
  } catch (err) {
    console.warn("Failed to inject credentials:", err.message);
  }
  return reqConfig;
});

// Log API errors for easier debugging
api.interceptors.response.use(
  response => response,
  error => {
    // console.error(`[n8n API] Error ${error.response?.status} on ${error.config?.url}:`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Response Interceptor: 401 Retry Logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If we get a 401 and haven't retried yet
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      console.warn("[n8n API] 401 Unauthorized received. Trying to recover...");
      originalRequest._retry = true;

      const config = require("../config");

      // Scenario A: API Key Failed -> Try Session Auth fallback
      if (originalRequest.headers["X-N8N-API-KEY"] && config.n8n.user && config.n8n.pass) {
        console.log("[n8n API] API Key rejected. Falling back to Session Auth...");
        delete originalRequest.headers["X-N8N-API-KEY"];

        // Switch URL from /api/v1 back to /rest
        if (originalRequest.baseURL && originalRequest.baseURL.includes("/api/v1")) {
          originalRequest.baseURL = originalRequest.baseURL.replace("/api/v1", "/rest");
        }

        try {
          const cookie = await getSessionCookie(true); // Force new session
          if (cookie) {
            originalRequest.headers["Cookie"] = cookie;
            return api(originalRequest);
          }
        } catch (err) {
          console.error("[n8n API] Fallback login failed:", err.message);
        }
      }

      // Scenario B: Session Auth Failed (Cookie Expired) -> Refresh & Retry
      else if (config.n8n.user && config.n8n.pass) {
        console.log("[n8n API] Session expired. Refreshing...");
        try {
          const cookie = await getSessionCookie(true); // Force refresh
          if (cookie) {
            originalRequest.headers["Cookie"] = cookie;
            return api(originalRequest);
          }
        } catch (err) {
          console.error("[n8n API] Session refresh failed:", err.message);
        }
      }
    }
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
    // Note: If falling back from API Key to Session, URL adjustment is handled in interceptor
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
    // Now we can just use the shared session mechanism for consistent access
    try {
      const res = await api.get("/settings");
      return res.data?.data || res.data;
    } catch (err) {
      console.warn("[n8n API] getSettings failed:", err.message);
      return {};
    }
  },
};
