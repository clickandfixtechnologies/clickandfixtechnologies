const AUTH_WORKER_URL =
"https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev";

const CUSTOMER_SESSION_KEY = "customerSession";

function getCustomerSession() {

    return localStorage.getItem(CUSTOMER_SESSION_KEY) || "";

}

function saveCustomerSession(session) {

    localStorage.setItem(CUSTOMER_SESSION_KEY, session);

}

function clearCustomerSession() {

    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem("customerLogin");
    localStorage.removeItem("customerData");

}

function getSessionPayload() {

    const session = getCustomerSession();

    try {

        const payload = session.split(".")[1];

        if (!payload) return null;

        const normalized =
        payload.replace(/-/g, "+").replace(/_/g, "/");

        return JSON.parse(atob(normalized));

    }
    catch (error) {

        return null;

    }

}

function isSessionExpired() {

    const payload = getSessionPayload();

    return !payload ||
    !payload.exp ||
    payload.exp <= Math.floor(Date.now() / 1000);

}

async function workerRequest(path, body = {}) {

    const response = await fetch(
        `${AUTH_WORKER_URL}${path}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(getCustomerSession()
                    ? { "Authorization": `Bearer ${getCustomerSession()}` }
                    : {})
            },
            body: JSON.stringify(body)
        }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {

        throw new Error(result.error || "Request failed.");

    }

    return result;

}

async function validateCustomerSession() {

    if (!getCustomerSession() || isSessionExpired()) {

        clearCustomerSession();

        return null;

    }

    try {

        const result = await workerRequest("/session");

        return result.customer;

    }
    catch (error) {

        clearCustomerSession();

        return null;

    }

}

function startSessionExpiryTimer(onExpired) {

    const payload = getSessionPayload();

    if (!payload?.exp) return;

    const delay = Math.max(
        0,
        (payload.exp * 1000) - Date.now()
    );

    window.setTimeout(() => {

        clearCustomerSession();

        onExpired();

    }, delay);

}

export {
    clearCustomerSession,
    getCustomerSession,
    isSessionExpired,
    saveCustomerSession,
    startSessionExpiryTimer,
    validateCustomerSession,
    workerRequest
};
