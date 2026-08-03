import { createJobStatusEmailHtml, jobStatusEmailTemplates } from "./job-status-email-templates.js";

const jobStatusTemplateRegistry = Object.freeze(
    jobStatusEmailTemplates.map(template => Object.freeze({
        ...template,
        render: data => createJobStatusEmailHtml(template, data)
    }))
);

export { jobStatusTemplateRegistry };
