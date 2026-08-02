import { auth } from "./firebase.js";

const AUTH_WORKER_URL =
"https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev";

/*=========================================
      ADMIN WORKER CLIENT
=========================================*/

async function adminWorkerRequest(path, body = {}) {

    const adminUser = auth.currentUser;

    if (!adminUser) {

        throw new Error("Admin login is required.");

    }

    const idToken = await adminUser.getIdToken();

    const response = await fetch(
        `${AUTH_WORKER_URL}${path}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify(body)
        }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {

        throw new Error(result.error || "Admin request failed.");

    }

    return result;

}

export {
    adminWorkerRequest
};
