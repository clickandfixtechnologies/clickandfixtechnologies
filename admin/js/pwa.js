if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js", { scope: "./" })
            .catch(error => console.error("Service worker registration failed.", error));
    });
}
