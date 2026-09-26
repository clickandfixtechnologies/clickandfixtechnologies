const AUTH_WORKER_URL =
    "https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev";

const CUSTOMER_SESSION_KEY = "customerSession";

function getCustomerSession() {
    return localStorage.getItem(CUSTOMER_SESSION_KEY) || "";
}

function saveCustomerSession(session) {
    if (!session || typeof session !== "string") {
        throw new Error("Invalid customer session.");
    }

    localStorage.setItem(CUSTOMER_SESSION_KEY, session);
}

function clearCustomerSession() {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem("customerLogin");
    localStorage.removeItem("customerData");
}

function decodeBase64Url(value) {
    const normalized = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padding = normalized.length % 4;

    const padded =
        padding === 0
            ? normalized
            : normalized + "=".repeat(4 - padding);

    return atob(padded);
}

function getSessionPayload() {
    const session = getCustomerSession();

    if (!session) {
        return null;
    }

    try {
        const parts = session.split(".");

        if (parts.length !== 3) {
            return null;
        }

        const payload = decodeBase64Url(parts[1]);

        return JSON.parse(payload);
    }
    catch (error) {
        console.error("Customer session payload decode failed.", error);
        return null;
    }
}

function isSessionExpired() {
    const payload = getSessionPayload();

    if (!payload) {
        return true;
    }

    if (!payload.exp) {
        return true;
    }

    return Number(payload.exp) <= Math.floor(Date.now() / 1000);
}

async function workerRequest(path, body = {}) {
    const session = getCustomerSession();

    const response = await fetch(
        `${AUTH_WORKER_URL}${path}`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",

                ...(session
                    ? {
                        "Authorization": `Bearer ${session}`
                    }
                    : {})
            },

            body: JSON.stringify(body)
        }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
        const error = new Error(
            result.error ||
            `Request failed (${response.status}).`
        );
        error.status = response.status;
        error.code = result.code || "";
        error.path = path;
        throw error;
    }

    return result;
}

function isSessionAuthenticationFailure(error) {
    return error?.code === "SESSION_INVALID";
}

async function validateCustomerSession() {
    const session = getCustomerSession();

    if (!session) {
        console.warn("[Customer Session] No session found.");
        return null;
    }

    if (isSessionExpired()) {
        console.warn("[Customer Session] Local JWT is expired.");
        clearCustomerSession();
        return null;
    }

    try {
        console.log("[Customer Session] Validating session with Worker...");

        const result = await workerRequest("/session");

        console.log("[Customer Session] Worker session validation success.", {
            customer: result.customer
        });

        return result.customer || null;

    } catch (error) {
        console.error("[Customer Session] Worker session validation failed.", {
            path: "/session",
            status: error?.status || 0,
            code: error?.code || "",
            message: error?.message || ""
        });

        if (isSessionAuthenticationFailure(error)) {
            clearCustomerSession();
            return null;
        }

        throw error;
    }
}

function startSessionExpiryTimer(onExpired) {
    const payload = getSessionPayload();

    if (!payload?.exp) {
        return;
    }

    const expiresAt = Number(payload.exp) * 1000;
    const delay = Math.max(
        0,
        expiresAt - Date.now()
    );

    window.setTimeout(() => {
        clearCustomerSession();

        if (typeof onExpired === "function") {
            onExpired();
        }
    }, delay);
}

export {
    clearCustomerSession,
    getCustomerSession,
    isSessionAuthenticationFailure,
    isSessionExpired,
    saveCustomerSession,
    startSessionExpiryTimer,
    validateCustomerSession,
    workerRequest
};