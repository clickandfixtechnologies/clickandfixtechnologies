const navigationItems = [
    { href: "dashboard.html", icon: "bi-grid-1x2-fill", label: "Dashboard" },
    { href: "customers.html", icon: "bi-people-fill", label: "Customers" },
    { href: "jobs.html", icon: "bi-tools", label: "Jobs" },
    { href: "settings.html", icon: "bi-gear-fill", label: "Settings" },
    { href: "email-templates.html", icon: "bi-envelope-fill", label: "Email Templates" },
    { href: "job-status-templates.html", icon: "bi-clipboard2-check-fill", label: "Job Status Templates" }
];

const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

function renderSidebar() {
    const menu = navigationItems.map(item => `
        <li class="${item.href === currentPage ? "active" : ""}">
            <a href="${item.href}">
                <i class="bi ${item.icon}" aria-hidden="true"></i>
                <span>${item.label}</span>
            </a>
        </li>
    `).join("");

    const sidebar = `
        <aside class="sidebar" aria-label="Admin navigation">
            <div class="logo">
                <h3>Click &amp; Fix</h3>
                <span>Technologies</span>
                <small>Admin Panel</small>
            </div>
            <ul class="sidebar-menu">
                ${menu}
                <li class="logout">
                    <a href="index.html" id="logoutBtn">
                        <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
                        <span>Logout</span>
                    </a>
                </li>
            </ul>
        </aside>
    `;

    const existingSidebar = document.querySelector(".sidebar");
    const placeholder = document.getElementById("sidebar");

    if (existingSidebar) {
        existingSidebar.outerHTML = sidebar;
    } else if (placeholder) {
        placeholder.outerHTML = sidebar;
    } else {
        document.body.insertAdjacentHTML("afterbegin", sidebar);
    }
}

function ensureOverlay() {
    let overlay = document.getElementById("sidebarOverlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "sidebarOverlay";
        overlay.className = "sidebar-overlay";
        document.body.appendChild(overlay);
    }

    return overlay;
}

function ensureMenuButton() {
    let button = document.getElementById("menuToggle");

    if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.id = "menuToggle";
        button.className = "mobile-menu-btn";
        button.innerHTML = '<i class="bi bi-list" aria-hidden="true"></i><span class="visually-hidden">Open navigation menu</span>';

        const header = document.querySelector(".topbar .header-left") || document.querySelector(".page-header");
        header?.prepend(button);
    }

    if (!button) return null;

    button.type = "button";
    button.classList.add("mobile-menu-btn");
    button.setAttribute("aria-label", "Open navigation menu");
    button.setAttribute("aria-controls", "adminSidebar");
    button.setAttribute("aria-expanded", "false");

    return button;
}

function initialiseMobileNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const overlay = ensureOverlay();
    const button = ensureMenuButton();

    if (!sidebar || !button) return;

    sidebar.id = "adminSidebar";

    const close = () => {
        sidebar.classList.remove("show");
        overlay.classList.remove("show");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Open navigation menu");
    };

    const toggle = event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const shouldOpen = !sidebar.classList.contains("show");
        sidebar.classList.toggle("show", shouldOpen);
        overlay.classList.toggle("show", shouldOpen);
        button.setAttribute("aria-expanded", String(shouldOpen));
        button.setAttribute("aria-label", shouldOpen ? "Close navigation menu" : "Open navigation menu");
    };

    button.addEventListener("click", toggle, true);
    overlay.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
        if (window.innerWidth <= 768) close();
    }));
    window.addEventListener("resize", () => {
        if (window.innerWidth > 768) close();
    });
}

renderSidebar();
initialiseMobileNavigation();
window.__adminShellReady = true;
