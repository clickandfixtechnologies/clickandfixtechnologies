import { auth, db } from "./firebase.js";
import { adminWorkerRequest } from "./admin-worker-client.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let offers = [];
let customers = [];
let selectedCustomerIds = new Set();
let existingAssignments = new Map();
let claims = [];
let verifiedOfferCode = null;

const $ = id => document.getElementById(id);
const editorModal = bootstrap.Modal.getOrCreateInstance($("offerEditorModal"));
const customerPickerModal = bootstrap.Modal.getOrCreateInstance($("customerPickerModal"));
const detailsModal = bootstrap.Modal.getOrCreateInstance($("offerDetailsModal"));
const claimDetailsModal = bootstrap.Modal.getOrCreateInstance($("claimDetailsModal"));

function escapeHtml(value = "") {
    return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusLabel(status) {
    const derived = status === "ACTIVE" && isExpired({ status, expiryDate: arguments[1] })
        ? "EXPIRED"
        : status;
    const classes = {
        DRAFT: "bg-secondary",
        ACTIVE: "bg-success",
        DISABLED: "bg-warning text-dark",
        EXPIRED: "bg-danger",
        ARCHIVED: "bg-dark"
    };
    return `<span class="badge ${classes[derived] || "bg-secondary"}">${escapeHtml(derived)}</span>`;
}

function isExpired(offer) {
    return Boolean(offer?.expiryDate) && Date.parse(offer.expiryDate) < Date.now();
}

function displayStatus(offer) {
    return offer.status === "ACTIVE" && isExpired(offer) ? "EXPIRED" : offer.status;
}

function formatDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "-";
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function number(value) {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function toInputDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function showToast(message, type = "success") {
    const toast = $("offerToast");
    toast.classList.remove("bg-success", "bg-danger", "bg-warning", "text-dark");
    toast.classList.add(type === "success" ? "bg-success" : "bg-danger");
    $("offerToastMessage").textContent = message;
    bootstrap.Toast.getOrCreateInstance(toast).show();
}

async function loadCustomers() {
    const snapshot = await getDocs(collection(db, "customers"));
    customers = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function loadOffers() {
    const result = await adminWorkerRequest("/admin/offers", { action: "list" });
    offers = result.offers || [];
    renderOffers();
}

function renderOffers() {
    const search = $("offerSearch").value.trim().toLowerCase();
    const filter = $("offerStatusFilter").value;
    const visibleOffers = offers.filter(offer => {
        const matchesSearch = !search || [offer.title, offer.shortTitle, offer.productOrService, offer.offerType]
        .some(value => String(value || "").toLowerCase().includes(search));
        return matchesSearch && (!filter || displayStatus(offer) === filter);
    });

    $("offerCount").textContent = offers.length;
    $("activeOfferCount").textContent = offers.filter(offer => displayStatus(offer) === "ACTIVE").length;
    $("claimedOfferCount").textContent = offers.reduce((total, offer) => total + Number(offer.claimedCount || 0), 0);
    $("redeemedOfferCount").textContent = offers.reduce((total, offer) => total + Number(offer.redeemedCount || 0), 0);
    $("analyticsAssigned").textContent = offers.reduce((total, offer) => total + Number(offer.assignedCustomerCount || 0), 0);
    $("analyticsViewed").textContent = offers.reduce((total, offer) => total + Number(offer.viewedCount || 0), 0);
    $("analyticsClaimed").textContent = offers.reduce((total, offer) => total + Number(offer.claimedCount || 0), 0);
    $("analyticsApproved").textContent = offers.reduce((total, offer) => total + Number(offer.approvedCount || 0), 0);
    $("analyticsRedeemed").textContent = offers.reduce((total, offer) => total + Number(offer.redeemedCount || 0), 0);
    $("analyticsExpired").textContent = offers.reduce((total, offer) => total + Number(offer.expiredCount || 0), 0);

    const body = $("offersTableBody");
    if (!visibleOffers.length) {
        body.innerHTML = '<tr><td colspan="9" class="text-center py-5 text-muted">No offers found.</td></tr>';
        return;
    }

    body.innerHTML = visibleOffers.map(offer => `
        <tr>
            <td class="offer-title-cell"><strong>${escapeHtml(offer.title)}</strong><span>${escapeHtml(offer.shortTitle || "-")}</span></td>
            <td>${escapeHtml(offer.productOrService || "-")}</td>
            <td>${escapeHtml(String(offer.offerType || "").replaceAll("_", " "))}</td>
            <td><span class="offer-count">${number(offer.assignedCustomerCount)}</span></td>
            <td><span class="offer-count">${number(offer.claimedCount)}</span> <small class="text-muted">/ ${number(offer.approvedCount)} / ${number(offer.redeemedCount)}</small></td>
            <td><small>${formatDate(offer.startDate)}<br>to ${formatDate(offer.expiryDate)}</small></td>
            <td>${statusLabel(displayStatus(offer), offer.expiryDate)}</td>
            <td>${offer.featured ? '<i class="bi bi-star-fill text-warning" aria-label="Featured"></i>' : "-"}</td>
            <td class="text-center"><div class="btn-group btn-group-sm offer-status-actions">
                <button class="btn btn-outline-primary" data-action="view" data-id="${escapeHtml(offer.offerId)}" title="View offer"><i class="bi bi-eye"></i></button>
                <button class="btn btn-outline-warning" data-action="edit" data-id="${escapeHtml(offer.offerId)}" title="Edit offer"><i class="bi bi-pencil-square"></i></button>
                <button class="btn btn-outline-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false"><span class="visually-hidden">Offer status actions</span></button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><button class="dropdown-item" data-action="status" data-status="ACTIVE" data-id="${escapeHtml(offer.offerId)}">Enable</button></li>
                    <li><button class="dropdown-item" data-action="status" data-status="DISABLED" data-id="${escapeHtml(offer.offerId)}">Disable</button></li>
                    <li><button class="dropdown-item" data-action="status" data-status="EXPIRED" data-id="${escapeHtml(offer.offerId)}">Expire</button></li>
                    <li><button class="dropdown-item" data-action="status" data-status="ARCHIVED" data-id="${escapeHtml(offer.offerId)}">Archive</button></li>
                </ul>
            </div></td>
        </tr>`).join("");
}

function resetEditor() {
    $("offerForm").reset();
    $("offerId").value = "";
    $("offerEditorTitle").innerHTML = '<i class="bi bi-tag-fill me-2"></i>Create Offer';
    $("offerStatus").value = "DRAFT";
    selectedCustomerIds = new Set();
    existingAssignments = new Map();
    renderSelectedCustomers();
}

function populateEditor(offer) {
    $("offerId").value = offer.offerId;
    $("offerTitle").value = offer.title || "";
    $("offerShortTitle").value = offer.shortTitle || "";
    $("offerDescription").value = offer.description || "";
    $("offerProduct").value = offer.productOrService || "";
    $("offerType").value = offer.offerType || "CUSTOM";
    $("discountType").value = offer.discountType || "NONE";
    $("originalPrice").value = offer.originalPrice || "";
    $("offerPrice").value = offer.offerPrice || "";
    $("discountValue").value = offer.discountValue || "";
    $("offerStartDate").value = toInputDate(offer.startDate);
    $("offerExpiryDate").value = toInputDate(offer.expiryDate);
    $("offerStatus").value = offer.status === "EXPIRED" ? "DISABLED" : offer.status;
    $("offerFeatured").checked = offer.featured === true;
    $("offerTerms").value = offer.termsAndConditions || "";
    $("offerEditorTitle").innerHTML = '<i class="bi bi-pencil-square me-2"></i>Edit Offer';
}

async function openEditor(offerId = "") {
    resetEditor();

    if (offerId) {
        const result = await adminWorkerRequest("/admin/offers", { action: "load", offerId });
        populateEditor(result.offer);
        const assignments = await adminWorkerRequest("/admin/offer-assignments", { action: "list", offerId });
        (assignments.assignments || []).forEach(assignment => {
            if (assignment.status !== "CANCELLED") {
                selectedCustomerIds.add(assignment.customerId);
                existingAssignments.set(assignment.customerId, assignment);
            }
        });
        renderSelectedCustomers();
    }

    editorModal.show();
}

function renderSelectedCustomers() {
    const selected = customers.filter(customer => selectedCustomerIds.has(customer.customerId));
    $("selectedCustomerCount").textContent = selected.length;
    $("selectedCustomers").innerHTML = selected.length
        ? selected.map(customer => {
            const assignment = existingAssignments.get(customer.customerId);
            const locked = assignment && !["ASSIGNED", "VIEWED"].includes(assignment.status);
            return `<span class="selected-customer-chip">${escapeHtml(customer.name || customer.customerId)} <small>(${escapeHtml(customer.customerId)})</small>${locked ? `<i class="bi bi-lock-fill" title="${escapeHtml(assignment.status)} history is preserved"></i>` : `<button type="button" data-remove-customer="${escapeHtml(customer.customerId)}" aria-label="Remove ${escapeHtml(customer.name || customer.customerId)}"><i class="bi bi-x-lg"></i></button>`}</span>`;
        }).join("")
        : '<small class="text-muted">No customers selected.</small>';
}

function visiblePickerCustomers() {
    const search = $("customerPickerSearch").value.trim().toLowerCase();
    return customers.filter(customer => !search || [customer.name, customer.customerId, customer.mobile, customer.email]
    .some(value => String(value || "").toLowerCase().includes(search)));
}

function renderCustomerPicker() {
    const visible = visiblePickerCustomers();
    $("pickerSelectedCount").textContent = selectedCustomerIds.size;
    $("selectVisibleCustomers").checked = Boolean(visible.length) && visible.every(customer => selectedCustomerIds.has(customer.customerId));
    $("customerPickerBody").innerHTML = visible.length ? visible.map(customer => `
        <tr>
            <td><input class="form-check-input customer-picker-check" type="checkbox" value="${escapeHtml(customer.customerId)}" ${selectedCustomerIds.has(customer.customerId) ? "checked" : ""}></td>
            <td>${escapeHtml(customer.name || "-")}</td><td>${escapeHtml(customer.customerId || "-")}</td><td>${escapeHtml(customer.mobile || "-")}</td><td>${escapeHtml(customer.email || "-")}</td>
        </tr>`).join("") : '<tr><td colspan="5" class="text-center py-4 text-muted">No matching customers.</td></tr>';
}

function offerPayload() {
    return {
        title: $("offerTitle").value.trim(),
        shortTitle: $("offerShortTitle").value.trim(),
        description: $("offerDescription").value.trim(),
        productOrService: $("offerProduct").value.trim(),
        offerType: $("offerType").value,
        discountType: $("discountType").value,
        originalPrice: $("originalPrice").value,
        offerPrice: $("offerPrice").value,
        discountValue: $("discountValue").value,
        termsAndConditions: $("offerTerms").value.trim(),
        startDate: new Date($("offerStartDate").value).toISOString(),
        expiryDate: new Date($("offerExpiryDate").value).toISOString(),
        status: $("offerStatus").value,
        featured: $("offerFeatured").checked
    };
}

async function reconcileAssignments(offerId) {
    const initial = new Map(existingAssignments);
    const removals = [...initial.entries()].filter(([customerId, assignment]) => !selectedCustomerIds.has(customerId) && ["ASSIGNED", "VIEWED"].includes(assignment.status));
    const additions = [...selectedCustomerIds].filter(customerId => !initial.has(customerId));

    for (const [, assignment] of removals) {
        await adminWorkerRequest("/admin/offer-assignments", { action: "cancel", assignmentId: assignment.assignmentId });
    }

    for (const customerId of additions) {
        await adminWorkerRequest("/admin/offer-assignments", { action: "assign", offerId, customerId });
    }
}

async function saveOffer(event) {
    event.preventDefault();
    const saveButton = $("saveOfferButton");
    const currentOfferId = $("offerId").value;

    if (Date.parse($("offerStartDate").value) > Date.parse($("offerExpiryDate").value)) {
        showToast("Expiry date must be after the start date.", "danger");
        return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    try {
        const payload = offerPayload();
        const result = await adminWorkerRequest("/admin/offers", currentOfferId
            ? { action: "update", offerId: currentOfferId, ...payload }
            : { action: "create", ...payload });
        await reconcileAssignments(result.offer.offerId);
        editorModal.hide();
        await loadOffers();
        showToast("Offer saved successfully.");
    } catch (error) {
        console.error("Offer save failed", error);
        showToast(error.message || "Offer could not be saved.", "danger");
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="bi bi-save me-1"></i>Save Offer';
    }
}

async function updateStatus(offerId, status) {
    const offer = offers.find(item => item.offerId === offerId);
    if (!offer) return;
    const action = status === "ACTIVE" ? "enable" : status.toLowerCase();
    if (!window.confirm(`Are you sure you want to ${action} this offer?`)) return;

    try {
        await adminWorkerRequest("/admin/offers", { action: "update", ...offer, status });
        await loadOffers();
        showToast(`Offer ${action}d successfully.`);
    } catch (error) {
        showToast(error.message || "Offer status could not be updated.", "danger");
    }
}

async function showDetails(offerId) {
    const offer = offers.find(item => item.offerId === offerId);
    if (!offer) return;
    const assignments = await adminWorkerRequest("/admin/offer-assignments", { action: "list", offerId });
    const activeAssignments = (assignments.assignments || []).filter(item => item.status !== "CANCELLED");
    $("offerDetailsBody").innerHTML = `
        <div class="offer-details-grid row">
            <div class="col-md-6"><dt>Offer Title</dt><dd>${escapeHtml(offer.title)}</dd></div><div class="col-md-6"><dt>Product / Service</dt><dd>${escapeHtml(offer.productOrService || "-")}</dd></div>
            <div class="col-md-6"><dt>Offer Type</dt><dd>${escapeHtml(String(offer.offerType || "").replaceAll("_", " "))}</dd></div><div class="col-md-6"><dt>Status</dt><dd>${statusLabel(displayStatus(offer), offer.expiryDate)}</dd></div>
            <div class="col-12"><dt>Description</dt><dd>${escapeHtml(offer.description || "-")}</dd></div>
            <div class="col-md-4"><dt>Original Price</dt><dd>₹${number(offer.originalPrice)}</dd></div><div class="col-md-4"><dt>Offer Price</dt><dd>₹${number(offer.offerPrice)}</dd></div><div class="col-md-4"><dt>Discount</dt><dd>${escapeHtml(offer.discountType || "NONE")} ${number(offer.discountValue)}</dd></div>
            <div class="col-md-6"><dt>Validity</dt><dd>${formatDate(offer.startDate)} to ${formatDate(offer.expiryDate)}</dd></div><div class="col-md-6"><dt>Customers</dt><dd>${activeAssignments.length} assigned, ${offer.claimedCount || 0} claimed, ${offer.approvedCount || 0} approved, ${offer.redeemedCount || 0} redeemed</dd></div>
            <div class="col-12"><dt>Terms &amp; Conditions</dt><dd>${escapeHtml(offer.termsAndConditions || "-")}</dd></div>
        </div>`;
    detailsModal.show();
}

$("createOfferButton").addEventListener("click", () => openEditor());
$("offerForm").addEventListener("submit", saveOffer);
$("offerSearch").addEventListener("input", renderOffers);
$("offerStatusFilter").addEventListener("change", renderOffers);
$("selectCustomersButton").addEventListener("click", () => { renderCustomerPicker(); customerPickerModal.show(); });
$("customerPickerSearch").addEventListener("input", renderCustomerPicker);
$("selectAllFilteredButton").addEventListener("click", () => { visiblePickerCustomers().forEach(customer => selectedCustomerIds.add(customer.customerId)); renderCustomerPicker(); renderSelectedCustomers(); });
$("selectVisibleCustomers").addEventListener("change", event => { visiblePickerCustomers().forEach(customer => event.target.checked ? selectedCustomerIds.add(customer.customerId) : selectedCustomerIds.delete(customer.customerId)); renderCustomerPicker(); renderSelectedCustomers(); });

$("customerPickerBody").addEventListener("change", event => {
    if (!event.target.matches(".customer-picker-check")) return;
    event.target.checked ? selectedCustomerIds.add(event.target.value) : selectedCustomerIds.delete(event.target.value);
    renderCustomerPicker();
    renderSelectedCustomers();
});

$("selectedCustomers").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-customer]");
    if (!button) return;
    selectedCustomerIds.delete(button.dataset.removeCustomer);
    renderSelectedCustomers();
});

$("offersTableBody").addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id, status } = button.dataset;
    try {
        if (action === "view") await showDetails(id);
        if (action === "edit") await openEditor(id);
        if (action === "status") await updateStatus(id, status);
    } catch (error) {
        console.error("Offer action failed", error);
        showToast(error.message || "Offer action failed.", "danger");
    }
});

function claimDisplayStatus(claim) {
    if (claim.status === "REDEEMED" || claim.status === "CANCELLED") return claim.status;
    if (claim.offer?.expiryDate && Date.parse(claim.offer.expiryDate) < Date.now()) return "EXPIRED";
    return claim.status;
}

function claimStatusBadge(status) {
    const classes = {
        CLAIMED: "bg-warning text-dark",
        APPROVED: "bg-success",
        REDEEMED: "bg-primary",
        EXPIRED: "bg-danger",
        CANCELLED: "bg-secondary",
        ASSIGNED: "bg-secondary",
        VIEWED: "bg-secondary"
    };
    return `<span class="badge ${classes[status] || "bg-secondary"}">${escapeHtml(status)}</span>`;
}

async function loadClaims() {
    const result = await adminWorkerRequest("/admin/offer-assignments", { action: "list" });
    claims = result.assignments || [];
    renderClaims();
}

function renderClaims() {
    const filter = $("claimStatusFilter").value;
    const visibleClaims = claims.filter(claim => !filter || claimDisplayStatus(claim) === filter);
    const body = $("claimsTableBody");
    const claimedCount = claims.filter(claim => claim.status === "CLAIMED").length;
    $("claimCountBadge").textContent = claimedCount;
    $("claimCountBadge").classList.toggle("d-none", !claimedCount);

    if (!visibleClaims.length) {
        body.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted">No offer claims found.</td></tr>';
        return;
    }

    body.innerHTML = visibleClaims
    .sort((a, b) => Date.parse(b.claimedAt || b.assignedAt || 0) - Date.parse(a.claimedAt || a.assignedAt || 0))
    .map(claim => `
        <tr>
            <td><strong>${escapeHtml(claim.customer?.name || "Customer")}</strong><small class="d-block text-muted">${escapeHtml(claim.customerId || "-")}</small></td>
            <td>${escapeHtml(claim.offer?.title || claim.offerId || "-")}</td>
            <td>${formatDate(claim.claimedAt || claim.assignedAt)}</td>
            <td>${claimStatusBadge(claimDisplayStatus(claim))}</td>
            <td><code>${escapeHtml(claim.offerCode || "-")}</code></td>
            <td>${formatDate(claim.offer?.expiryDate)}</td>
            <td class="text-center"><button class="btn btn-sm btn-outline-primary" data-claim-action="view" data-assignment-id="${escapeHtml(claim.assignmentId)}"><i class="bi bi-eye"></i> View</button></td>
        </tr>`).join("");
}

function lifecycleItem(label, timestamp, done) {
    return `<div class="claim-lifecycle-item ${done ? "done" : ""}"><i class="bi ${done ? "bi-check-circle-fill" : "bi-circle"}"></i><span>${escapeHtml(label)}${timestamp ? ` <small>· ${escapeHtml(formatDate(timestamp))}</small>` : ""}</span></div>`;
}

async function openClaimDetails(assignmentId) {
    const result = await adminWorkerRequest("/admin/offer-assignments", { action: "load", assignmentId });
    const claim = result.assignment;
    const offer = claim.offer || {};
    const customer = claim.customer || {};
    const status = claimDisplayStatus(claim);
    $("claimDetailsBody").innerHTML = `
        <div class="offer-details-grid row">
            <div class="col-md-6"><dt>Customer Name</dt><dd>${escapeHtml(customer.name || "-")}</dd></div><div class="col-md-6"><dt>Customer ID</dt><dd>${escapeHtml(claim.customerId || "-")}</dd></div>
            <div class="col-md-6"><dt>Mobile</dt><dd>${escapeHtml(customer.mobile || "-")}</dd></div><div class="col-md-6"><dt>Email</dt><dd>${escapeHtml(customer.email || "-")}</dd></div>
            <div class="col-md-6"><dt>Offer</dt><dd>${escapeHtml(offer.title || "-")}</dd></div><div class="col-md-6"><dt>Offer Price</dt><dd>₹${number(offer.offerPrice)}</dd></div>
            <div class="col-12"><dt>Description</dt><dd>${escapeHtml(offer.description || "-")}</dd></div>
            <div class="col-md-6"><dt>Claimed At</dt><dd>${formatDate(claim.claimedAt || "-")}</dd></div><div class="col-md-6"><dt>Expiry Date</dt><dd>${formatDate(offer.expiryDate)}</dd></div>
            <div class="col-md-6"><dt>Current Status</dt><dd>${claimStatusBadge(status)}</dd></div><div class="col-md-6"><dt>Offer Code</dt><dd><code>${escapeHtml(claim.offerCode || "Not generated")}</code></dd></div>
            <div class="col-md-6"><dt>Preferred Contact</dt><dd>${escapeHtml(claim.preferredContact || "No preference")}</dd></div><div class="col-md-6"><dt>Additional Note</dt><dd>${escapeHtml(claim.additionalNote || "-")}</dd></div>
        </div>
        <div class="claim-lifecycle">${lifecycleItem("Assigned", claim.assignedAt, Boolean(claim.assignedAt))}${lifecycleItem("Viewed", claim.viewedAt, Boolean(claim.viewedAt))}${lifecycleItem("Claimed", claim.claimedAt, Boolean(claim.claimedAt))}${lifecycleItem("Approved / Code Generated", claim.approvedAt, Boolean(claim.approvedAt))}${lifecycleItem("Redeemed", claim.redeemedAt, Boolean(claim.redeemedAt))}</div>`;

    const canApprove = claim.status === "CLAIMED" && status === "CLAIMED";
    const canCancel = ["CLAIMED", "APPROVED"].includes(claim.status) && status !== "EXPIRED";
    $("claimDetailsActions").innerHTML = `<button type="button" class="btn btn-light" data-bs-dismiss="modal">Close</button>${canCancel ? `<button id="cancelClaimButton" class="btn btn-outline-danger">Cancel Claim</button>` : ""}${canApprove ? `<button id="approveClaimButton" class="btn btn-success"><i class="bi bi-check2-circle me-1"></i>Approve Claim</button>` : ""}`;
    $("approveClaimButton")?.addEventListener("click", () => approveClaim(claim.assignmentId));
    $("cancelClaimButton")?.addEventListener("click", () => cancelClaim(claim.assignmentId));
    claimDetailsModal.show();
}

async function approveClaim(assignmentId) {
    const button = $("approveClaimButton");
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Approving...'; }
    try {
        const result = await adminWorkerRequest("/admin/offer-assignments", { action: "approve", assignmentId });
        await Promise.all([loadClaims(), loadOffers()]);
        showToast(`Claim approved. Offer code: ${result.offerCode.offerCode}`);
        await openClaimDetails(assignmentId);
    } catch (error) {
        showToast(error.message || "Claim could not be approved.", "danger");
    }
}

async function cancelClaim(assignmentId) {
    if (!window.confirm("Cancel this claim? The history will be preserved and an unused offer code will be cancelled.")) return;
    try {
        await adminWorkerRequest("/admin/offer-assignments", { action: "cancel", assignmentId });
        claimDetailsModal.hide();
        await Promise.all([loadClaims(), loadOffers()]);
        showToast("Claim cancelled. Historical records were preserved.");
    } catch (error) {
        showToast(error.message || "Claim could not be cancelled.", "danger");
    }
}

function renderRedeemResult(code) {
    verifiedOfferCode = code;
    const status = code.status;
    const valid = status === "UNUSED";
    const state = status === "REDEEMED"
        ? { icon: "bi-x-circle-fill text-danger", title: "Offer Already Redeemed" }
        : status === "EXPIRED"
            ? { icon: "bi-clock-history text-warning", title: "Offer Expired" }
            : status === "CANCELLED"
                ? { icon: "bi-x-circle-fill text-secondary", title: "Offer Cancelled" }
                : { icon: "bi-check-circle-fill text-success", title: "Valid Offer" };
    $("redeemResult").innerHTML = `
        <div class="redeem-result-card"><h5><i class="bi ${state.icon} me-2"></i>${state.title}</h5><dl class="row mt-3">
            <dt class="col-sm-4">Customer</dt><dd class="col-sm-8">${escapeHtml(code.customer?.name || "-")}</dd>
            <dt class="col-sm-4">Customer ID</dt><dd class="col-sm-8">${escapeHtml(code.customerId || "-")}</dd>
            <dt class="col-sm-4">Offer</dt><dd class="col-sm-8">${escapeHtml(code.offer?.title || "-")}</dd>
            <dt class="col-sm-4">Offer Price</dt><dd class="col-sm-8">₹${number(code.offer?.offerPrice)}</dd>
            <dt class="col-sm-4">Claimed</dt><dd class="col-sm-8">${formatDate(code.assignment?.claimedAt)}</dd>
            <dt class="col-sm-4">Approved</dt><dd class="col-sm-8">${formatDate(code.approvedAt)}</dd>
            <dt class="col-sm-4">Expiry</dt><dd class="col-sm-8">${formatDate(code.expiryDate)}</dd>
            <dt class="col-sm-4">Status</dt><dd class="col-sm-8">${claimStatusBadge(status)}</dd>
            ${status === "REDEEMED" ? `<dt class="col-sm-4">Redeemed On</dt><dd class="col-sm-8">${formatDate(code.redeemedAt)}</dd><dt class="col-sm-4">Redeemed By</dt><dd class="col-sm-8">${escapeHtml(code.redeemedBy || "-")}</dd>` : ""}
        </dl>${valid ? '<button id="redeemVerifiedCodeButton" class="btn btn-success"><i class="bi bi-check2-circle me-1"></i>Redeem Offer</button>' : ""}</div>`;
    $("redeemVerifiedCodeButton")?.addEventListener("click", redeemVerifiedCode);
}

async function verifyOfferCode(event) {
    event.preventDefault();
    const codeInput = $("redeemOfferCodeInput");
    const button = $("verifyOfferCodeButton");
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Verifying...';
    try {
        const result = await adminWorkerRequest("/admin/offer-assignments", { action: "verify-code", offerCode: codeInput.value.trim().toUpperCase() });
        renderRedeemResult(result.code);
    } catch (error) {
        verifiedOfferCode = null;
        $("redeemResult").innerHTML = '<div class="alert alert-danger mb-0"><i class="bi bi-x-circle-fill me-2"></i>Invalid Offer Code</div>';
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-search me-1"></i>Verify Code';
    }
}

async function redeemVerifiedCode() {
    if (!verifiedOfferCode?.offerCode) return;
    const button = $("redeemVerifiedCodeButton");
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Redeeming...';
    try {
        const result = await adminWorkerRequest("/admin/offer-assignments", { action: "redeem", offerCode: verifiedOfferCode.offerCode });
        showToast(`Offer redeemed successfully. Reference: ${result.redemption.redemptionReference}`);
        const verifyResult = await adminWorkerRequest("/admin/offer-assignments", { action: "verify-code", offerCode: verifiedOfferCode.offerCode });
        renderRedeemResult(verifyResult.code);
        await Promise.all([loadClaims(), loadOffers()]);
    } catch (error) {
        showToast(error.message || "Offer could not be redeemed.", "danger");
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Redeem Offer';
    }
}

async function loadOfferNotifications() {
    const result = await adminWorkerRequest("/admin/offer-notifications", { action: "list" });
    const notifications = result.notifications || [];
    const unread = notifications.filter(item => item.read !== true);
    $("offerNotificationCount").textContent = unread.length;
    $("offerNotificationCount").classList.toggle("d-none", !unread.length);
    $("offerNotificationsList").innerHTML = notifications.length ? notifications.map(item => `<li><button class="dropdown-item offer-notification-item ${item.read ? "" : "unread"}" data-notification-id="${escapeHtml(item.notificationId)}" data-assignment-id="${escapeHtml(item.assignmentId || "")}"><strong>${escapeHtml(item.title || "Notification")}</strong><small>${escapeHtml(item.customerName || "Customer")} · ${escapeHtml(item.offerTitle || "Offer")}</small><small>${formatDate(item.claimedAt || item.createdAt)}</small></button></li>`).join("") : '<li><span class="dropdown-item-text text-muted">No offer notifications.</span></li>';
}

function showOfferPanel(name) {
    ["manage", "claims", "redeem"].forEach(panel => $(panel === "manage" ? "manageOffersPanel" : `${panel}Panel`).classList.toggle("d-none", panel !== name));
    document.querySelectorAll("[data-offer-panel]").forEach(button => button.classList.toggle("active", button.dataset.offerPanel === name));
    if (name === "claims") loadClaims().catch(error => showToast(error.message || "Claims could not be loaded.", "danger"));
}

document.querySelectorAll("[data-offer-panel]").forEach(button => button.addEventListener("click", () => showOfferPanel(button.dataset.offerPanel)));
$("claimStatusFilter").addEventListener("change", renderClaims);
$("claimsTableBody").addEventListener("click", event => {
    const button = event.target.closest("[data-claim-action]");
    if (button?.dataset.claimAction === "view") openClaimDetails(button.dataset.assignmentId).catch(error => showToast(error.message || "Claim details could not be loaded.", "danger"));
});
$("verifyOfferCodeForm").addEventListener("submit", verifyOfferCode);
$("offerNotificationsList").addEventListener("click", async event => {
    const button = event.target.closest("[data-notification-id]");
    if (!button) return;
    try {
        await adminWorkerRequest("/admin/offer-notifications", { action: "mark-read", notificationId: button.dataset.notificationId });
        await loadOfferNotifications();
        showOfferPanel("claims");
        if (button.dataset.assignmentId) await openClaimDetails(button.dataset.assignmentId);
    } catch (error) {
        showToast(error.message || "Notification could not be opened.", "danger");
    }
});

onAuthStateChanged(auth, async user => {
    if (!user) return;
    try {
        await Promise.all([loadCustomers(), loadOffers(), loadOfferNotifications()]);
        const params = new URLSearchParams(window.location.search);
        if (params.get("tab") === "claims") {
            showOfferPanel("claims");
            if (params.get("assignmentId")) await openClaimDetails(params.get("assignmentId"));
        }
    } catch (error) {
        console.error("Offers could not be loaded", error);
        showToast(error.message || "Offers could not be loaded.", "danger");
    }
});
