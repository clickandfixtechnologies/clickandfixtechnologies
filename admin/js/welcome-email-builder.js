import {
    createWelcomeEmailHtml,
    getWelcomeEmailConfig,
    welcomeEmailDefaults,
    welcomeEmailPlaceholders
}
from "./welcome-email-template.js";

/*=========================================
      WELCOME EMAIL BUILDER
=========================================*/

const BUILDER_STORAGE_KEY = "cf_welcome_email_builder";

const builderForm =
document.getElementById("welcomeEmailBuilderForm");

const previewFrame =
document.getElementById("welcomeEmailPreview");

const previewSubject =
document.getElementById("previewSubject");

function getBuilderConfig() {

    const storedConfig = JSON.parse(
        localStorage.getItem(BUILDER_STORAGE_KEY)
    ) || {};

    return getWelcomeEmailConfig(storedConfig);

}

function fillBuilderForm(config) {

    Object.entries(config).forEach(([key, value]) => {

        const field = builderForm.elements[key];

        if (!field) return;

        if (field.type === "checkbox") {

            field.checked = value;

            return;

        }

        field.value = value;

    });

}

function readBuilderForm() {

    const config = {};

    Array.from(builderForm.elements).forEach(field => {

        if (!field.name) return;

        config[field.name] =
        field.type === "checkbox"
            ? field.checked
            : field.value.trim();

    });

    return config;

}

function renderPreview() {

    const config = readBuilderForm();

    localStorage.setItem(
        BUILDER_STORAGE_KEY,
        JSON.stringify(config)
    );

    previewSubject.textContent = config.subject;

    previewFrame.srcdoc = createWelcomeEmailHtml({
        config,
        data: {
            customerName: "Rahul Sharma",
            customerId: "CF2026-001",
            username: "9876543210",
            temporaryPassword: "CF@Secure123!"
        }
    });

}

async function copyText(text, message) {

    try {

        await navigator.clipboard.writeText(text);

        alert(message);

    }
    catch (error) {

        console.error(error);

        alert("Copy failed. Please copy the value manually.");

    }

}

builderForm.addEventListener("input", renderPreview);
builderForm.addEventListener("change", renderPreview);

document.getElementById("copyEmailHtml")
.addEventListener("click", () => {

    copyText(
        createWelcomeEmailHtml({ config: readBuilderForm() }),
        "Welcome Email HTML copied."
    );

});

document.getElementById("resetWelcomeEmail")
.addEventListener("click", () => {

    localStorage.removeItem(BUILDER_STORAGE_KEY);

    fillBuilderForm(welcomeEmailDefaults);

    renderPreview();

});

const placeholderList =
document.getElementById("placeholderList");

welcomeEmailPlaceholders.forEach(placeholder => {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "placeholder-token";
    button.textContent = placeholder;

    button.addEventListener("click", () => {

        copyText(placeholder, `${placeholder} copied.`);

    });

    placeholderList.appendChild(button);

});

fillBuilderForm(getBuilderConfig());
renderPreview();
