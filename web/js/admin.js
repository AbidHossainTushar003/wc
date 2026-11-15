/**
 * Shopademia - Web Admin Controller
 * Drives the Shopademia admin modules.
 */

const API_BASE = '/api';
const ADMIN_SESSION_KEY = 'wc_admin_session';
const ADMIN_NAME_KEY = 'wc_admin_name';
const ADMIN_REQUEST_TIMEOUT_MS = 15000;
sessionStorage.removeItem('wc_admin_token');
sessionStorage.removeItem('wc_admin_dev_token');
let adminPermissions = null;
let adminMustChangePassword = false;
let adminPermissionRefreshPromise = null;
let adminPermissionRefreshTimer = null;
let adminPermissionRefreshStarted = false;
let adminFocusRefreshHandler = null;
let adminVisibilityRefreshHandler = null;
let adminSessionChannel = null;
let productsById = new Map();
let couponsById = new Map();
let pendingProductSave = null;
let productImages = [];
let selectedProductFiles = [];
let productPreviewUrls = [];
let homepageProducts = [];
let homepageCategories = [];
let heroSlides = [];
let primaryNavLinks = [];
let supportSelectedConversation = 0;
let supportConversationsById = new Map();
let supportAssignableStaff = [];
let supportInboxTimer = null;
let supportInboxInFlight = false;
let supportNotificationTimer = null;
let lastSupportUnreadCount = 0;
let staffRoles = [];
let staffAccounts = [];
let consentReceipts = [];
let ordersForSorting = [];
let ordersPage = 1;
let ordersPageCount = 1;
let selectedOrderForNotes = 0;
let auditLogPage = 1;
let customersForFiltering = [];
let selectedCategoryImageUrl = '';
let categoryImagePath = 'assets/category-placeholder.svg';
let categoriesById = new Map();
let currentPromoImage = '';
let lastReportsData = null;
let trackingSlots = {};

const ADMIN_MODULE_READ_PERMISSIONS = {
    dashboard: 'reports.read',
    products: 'products.read',
    categories: 'categories.read',
    orders: 'orders.read',
    customers: 'customers.read',
    coupons: 'coupons.read',
    inventory: 'inventory.read',
    reports: 'reports.read',
    settings: 'settings.read',
    support: 'support.read',
    team: 'administration.users.read',
    audit: 'administration.audit.read'
};

const TRACKING_SLOT_KEYS = [
    'gsc_verification',
    'ga4',
    'gtm_head',
    'gtm_noscript',
    'meta_pixel_head',
    'meta_pixel_noscript',
    'custom_head',
    'body_start',
    'body_end'
];

const TRACKING_SLOT_HELP = {
    gsc_verification: 'Paste the full Google Search Console verification meta tag or its bare verification token.',
    ga4: 'Paste the Google tag (gtag.js) snippet for this store. GA4 ID warnings do not block saving.',
    gtm_head: 'Paste the Google Tag Manager script portion for the head.',
    gtm_noscript: 'Paste the Google Tag Manager noscript iframe portion. Confirm the iframe checkbox before saving.',
    meta_pixel_head: 'Paste the Meta Pixel base code. Pixel ID warnings do not block saving.',
    meta_pixel_noscript: 'Paste the optional Meta Pixel noscript image markup.',
    custom_head: 'Paste other trusted head snippets, such as Bing or Pinterest verification tags.',
    body_start: 'Paste trusted custom markup to run immediately after the opening body tag.',
    body_end: 'Paste trusted custom markup to run immediately before the closing body tag.'
};

function hasAdminPermission(permission) {
    if (!Array.isArray(adminPermissions)) return false;
    const separator = permission.indexOf('.');
    if (separator < 1) return false;
    const moduleName = permission.slice(0, separator);
    return adminPermissions.includes('*.*')
        || adminPermissions.includes(`${moduleName}.*`)
        || adminPermissions.includes(permission);
}

async function loadSupportInbox() {
    if (!hasAdminPermission('support.read') || supportInboxInFlight) return;
    supportInboxInFlight = true;
    const status = document.getElementById('support-chat-status');
    try {
        const filters = new URLSearchParams({
            status: document.getElementById('support-ticket-status-filter').value,
            priority: document.getElementById('support-ticket-priority-filter').value,
            q: document.getElementById('support-ticket-search').value.trim()
        });
        const [listResponse, settingsResponse, faqResponse] = await Promise.all([
            adminFetch(`${API_BASE}/support-chat.php?action=admin_list&${filters}`),
            adminFetch(`${API_BASE}/support-chat.php?action=admin_settings`),
            adminFetch(`${API_BASE}/support-chat.php?action=admin_faq`)
        ]);
        const [list, settings, faqs] = await Promise.all([
            listResponse.json(), settingsResponse.json(), faqResponse.json()
        ]);
        if (!listResponse.ok || list.status !== 'success'
            || !settingsResponse.ok || settings.status !== 'success'
            || !faqResponse.ok || faqs.status !== 'success') {
            throw new Error(list.error || settings.error || faqs.error || 'Could not load support data.');
        }
        document.getElementById('support-admin-online').checked = Number(settings.data.admin_online) === 1;
        document.getElementById('support-bot-wait').value = Number(settings.data.bot_wait_seconds) || 60;
        renderSupportConversations(list.data || []);
        const conversations = list.data || [];
        supportConversationsById = new Map(conversations.map(item => [Number(item.id), item]));
        supportAssignableStaff = Array.isArray(list.assignable_staff) ? list.assignable_staff : [];
        renderAdminInsights('support', [
            { label: 'Matching conversations', value: conversations.length },
            { label: 'Unread messages', value: conversations.reduce((sum, item) => sum + (Number(item.unread_count) || 0), 0) },
            { label: 'Awaiting staff', value: conversations.filter(item => ['customer', 'guest'].includes(String(item.last_sender_type || '').toLowerCase())).length }
        ], [
            { label: 'Unread', value: conversations.reduce((sum, item) => sum + (Number(item.unread_count) || 0), 0) },
            { label: 'Read', value: conversations.filter(item => !(Number(item.unread_count) || 0)).length }
        ]);
        renderSupportFaqs(faqs.data || []);
        if (supportSelectedConversation && supportConversationsById.has(supportSelectedConversation)) {
            await loadSupportMessages(supportSelectedConversation);
        } else if (supportSelectedConversation) {
            supportSelectedConversation = 0;
            document.getElementById('support-conversation-title').textContent = 'Select a conversation';
            document.getElementById('support-admin-messages').replaceChildren();
            document.getElementById('support-admin-reply').disabled = true;
            document.querySelector('[data-support-reply-button]').disabled = true;
            document.querySelector('[data-support-close-button]').disabled = true;
            document.querySelector('[data-support-delete-button]').disabled = true;
            document.getElementById('support-internal-note').disabled = true;
            document.querySelector('[data-support-note-button]').disabled = true;
            document.getElementById('support-ticket-controls').hidden = true;
        }
        status.textContent = `${list.data.length} conversation(s) match the current filters.`;
        if (!supportInboxTimer) {
            supportInboxTimer = window.setInterval(() => {
                if (document.getElementById('mod-support')?.classList.contains('active')) {
                    void loadSupportInbox();
                }
            }, 5000);
        }
    } catch (error) {
        status.textContent = error.message || 'Could not load the support inbox.';
    } finally {
        supportInboxInFlight = false;
    }
}

function startSupportNotificationPolling() {
    if (!hasAdminPermission('support.read') || supportNotificationTimer) return;
    const poll = async () => {
        if (!hasAdminPermission('support.read')) return;
        try {
            const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_list`);
            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                throw new Error(result.error || 'Support notifications could not be refreshed.');
            }
            const unread = (result.data || []).reduce((total, item) => total + (Number(item.unread_count) || 0), 0);
            const badge = document.getElementById('support-unread-badge');
            badge.textContent = unread ? String(unread) : '';
            badge.hidden = unread === 0;
            if (unread > lastSupportUnreadCount
                && document.visibilityState === 'hidden'
                && 'Notification' in window
                && Notification.permission === 'granted') {
                new Notification('New customer support message', {
                    body: 'Open the admin panel to read and reply.'
                });
            }
            lastSupportUnreadCount = unread;
        } catch (error) {
            console.error('Support inbox notification check failed:', error);
        }
    };
    void poll();
    supportNotificationTimer = window.setInterval(() => void poll(), 5000);
}

function getSupportConversationPreviewLabel(conversation) {
    const senderType = (conversation.last_sender_type || '').toLowerCase();
    if (senderType === 'bot') return 'AI automation';
    if (senderType === 'admin') return 'Support staff';
    if (senderType === 'customer' || senderType === 'guest') return 'Customer';
    return 'Customer';
}

function renderSupportConversations(conversations) {
    const container = document.getElementById('support-conversation-list');
    container.replaceChildren();
    if (!conversations.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'support-empty-state';
        emptyState.textContent = 'No open conversations.';
        container.append(emptyState);
        return;
    }

    conversations.forEach(conversation => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'support-conversation-item';
        button.dataset.cspClick = 'selectSupportConversation';
        button.dataset.conversationId = String(Number(conversation.id));
        if (Number(conversation.id) === supportSelectedConversation) {
            button.classList.add('is-active');
        }

        const unread = Number(conversation.unread_count) || 0;
        const guestLabel = (conversation.guest_name || 'Customer').trim();
        const guestContact = conversation.guest_contact && conversation.guest_contact !== 'Hidden' ? ` (${conversation.guest_contact})` : '';
        const senderLabel = getSupportConversationPreviewLabel(conversation);
        const preview = conversation.last_message ? `${senderLabel}: ${conversation.last_message}` : `${senderLabel}: No message yet`;

        const heading = document.createElement('div');
        heading.className = 'support-conversation-head';
        const name = document.createElement('span');
        name.className = 'support-conversation-name';
        name.textContent = `${guestLabel}${guestContact}`;
        const badge = document.createElement('span');
        badge.className = 'support-conversation-badge';
        badge.textContent = unread ? String(unread) : '0';
        badge.hidden = unread === 0;
        heading.append(name, badge);

        const previewNode = document.createElement('p');
        previewNode.className = 'support-conversation-preview';
        previewNode.textContent = preview;

        const meta = document.createElement('span');
        meta.className = 'support-conversation-meta';
        const activity = conversation.last_activity_at ? new Date(conversation.last_activity_at).toLocaleString([], {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }) : 'Just now';
        meta.textContent = `${String(conversation.ticket_status || 'open').toUpperCase()} · ${String(conversation.ticket_priority || 'normal').toUpperCase()} · ${activity}`;

        button.append(heading, previewNode, meta);
        button.setAttribute('aria-pressed', Number(conversation.id) === supportSelectedConversation ? 'true' : 'false');
        container.append(button);
    });
}

async function loadSupportMessages(conversationId) {
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_messages&conversation_id=${encodeURIComponent(conversationId)}`);
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.error || 'Could not load conversation messages.');
    }
    const conversation = result.data || [];
    const container = document.getElementById('support-admin-messages');
    container.replaceChildren();
    conversation.forEach(message => {
        const article = document.createElement('article');
        article.className = 'support-admin-message';
        article.dataset.senderType = message.sender_type || 'customer';
        const sender = document.createElement('strong');
        const senderLabel = message.actor_label || (
            message.sender_type === 'internal_note' ? 'Internal note'
                : message.sender_type === 'admin' ? 'Support staff'
                : message.sender_type === 'bot' ? 'AI automation' : 'Customer'
        );
        const customerSent = ['customer', 'guest'].includes(message.sender_type);
        sender.textContent = message.sender_type === 'internal_note'
            ? `${senderLabel} · staff only`
            : customerSent
            ? `${senderLabel} → Support team`
            : `${senderLabel} → Customer`;
        const meta = document.createElement('small');
        meta.textContent = new Date(message.created_at || Date.now()).toLocaleString();
        meta.className = 'support-admin-message-meta';
        const body = document.createElement('p');
        body.textContent = message.message;
        body.style.whiteSpace = 'pre-wrap';
        article.append(sender, meta, body);
        container.append(article);
    });
    container.scrollTop = container.scrollHeight;
    const title = document.getElementById('support-conversation-title');
    const selected = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    const titleText = selected ? selected.textContent.split(' · ')[0].trim() : `Conversation ${conversationId}`;
    title.textContent = titleText || `Conversation ${conversationId}`;
    const ticket = supportConversationsById.get(Number(conversationId));
    const ticketControls = document.getElementById('support-ticket-controls');
    ticketControls.hidden = !ticket || !hasAdminPermission('support.update');
    if (ticket) {
        document.getElementById('support-ticket-status').value = ticket.ticket_status || 'open';
        document.getElementById('support-ticket-priority').value = ticket.ticket_priority || 'normal';
        const assignee = document.getElementById('support-ticket-assignee');
        assignee.replaceChildren(new Option('Unassigned', ''));
        supportAssignableStaff.forEach(staff => {
            assignee.add(new Option(`${staff.full_name} (${staff.role})`, String(staff.id)));
        });
        assignee.value = ticket.assigned_admin_id === null ? '' : String(ticket.assigned_admin_id);
    }
    const conversationIsOpen = ticket?.status === 'open';
    document.getElementById('support-admin-reply').disabled = !conversationIsOpen;
    document.querySelector('[data-support-reply-button]').disabled = !conversationIsOpen;
    document.querySelector('[data-support-close-button]').disabled = !conversationIsOpen;
    document.querySelector('[data-support-delete-button]').disabled = !adminPermissions?.includes('*.*');
    document.getElementById('support-internal-note').disabled = false;
    document.querySelector('[data-support-note-button]').disabled = false;
}

async function selectSupportConversation(id) {
    if (!hasAdminPermission('support.read') || !Number.isSafeInteger(id) || id < 1) return;
    supportSelectedConversation = id;
    try {
        await loadSupportMessages(id);
    } catch (error) {
        document.getElementById('support-chat-status').textContent = error.message;
    }
}

async function sendSupportReply(event) {
    event.preventDefault();
    if (!hasAdminPermission('support.update') || !supportSelectedConversation) return;
    const input = document.getElementById('support-admin-reply');
    const message = input.value.trim();
    if (!message) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: supportSelectedConversation, message })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        document.getElementById('support-chat-status').textContent = result.error || 'Reply failed.';
        return;
    }
    input.value = '';
    document.getElementById('support-chat-status').textContent =
        result.notification === 'failed'
            ? 'Reply saved, but the customer email notification failed.'
            : result.notification === 'not_available'
                ? 'Reply saved. No customer email address is available for notification.'
                : 'Reply and customer email notification sent.';
    await loadSupportInbox();
}

async function saveSupportTicket(event) {
    event.preventDefault();
    if (!hasAdminPermission('support.update') || !supportSelectedConversation) return;
    const assignee = document.getElementById('support-ticket-assignee').value;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_update_ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversation_id: supportSelectedConversation,
            ticket_status: document.getElementById('support-ticket-status').value,
            priority: document.getElementById('support-ticket-priority').value,
            assigned_admin_id: assignee === '' ? null : Number(assignee)
        })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        document.getElementById('support-chat-status').textContent =
            result.error || 'The support ticket could not be updated.';
        return;
    }
    document.getElementById('support-chat-status').textContent = 'Support ticket updated.';
    await loadSupportInbox();
}

async function sendSupportInternalNote(event) {
    event.preventDefault();
    if (!hasAdminPermission('support.update') || !supportSelectedConversation) return;
    const input = document.getElementById('support-internal-note');
    const message = input.value.trim();
    if (!message) return;
    const button = document.querySelector('[data-support-note-button]');
    button.disabled = true;
    try {
        const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_internal_note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_id: supportSelectedConversation, message })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            document.getElementById('support-chat-status').textContent =
                result.error || 'The internal note could not be saved.';
            return;
        }
        input.value = '';
        await loadSupportMessages(supportSelectedConversation);
        document.getElementById('support-chat-status').textContent = 'Internal note saved for staff only.';
    } catch (error) {
        document.getElementById('support-chat-status').textContent =
            error.message || 'The internal note could not be saved.';
    } finally {
        button.disabled = false;
    }
}

async function filterSupportTickets(event) {
    event.preventDefault();
    await loadSupportInbox();
}

async function closeSupportConversation() {
    if (!hasAdminPermission('support.update') || !supportSelectedConversation) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: supportSelectedConversation })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        document.getElementById('support-chat-status').textContent = result.error || 'Conversation could not be closed.';
        return;
    }
    supportSelectedConversation = 0;
    document.getElementById('support-conversation-title').textContent = 'Select a conversation';
    document.getElementById('support-admin-messages').replaceChildren();
    document.getElementById('support-admin-reply').disabled = true;
    document.querySelector('[data-support-reply-button]').disabled = true;
    document.querySelector('[data-support-close-button]').disabled = true;
    document.getElementById('support-ticket-controls').hidden = true;
    await loadSupportInbox();
}

async function deleteSupportConversation() {
    if (!adminPermissions?.includes('*.*') || !supportSelectedConversation
        || !window.confirm('Permanently delete this support conversation and its messages? This cannot be undone.')) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: supportSelectedConversation })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        document.getElementById('support-chat-status').textContent =
            result.error || 'The conversation could not be deleted.';
        return;
    }
    supportSelectedConversation = 0;
    document.getElementById('support-conversation-title').textContent = 'Select a conversation';
    document.getElementById('support-admin-messages').replaceChildren();
    document.getElementById('support-admin-reply').disabled = true;
    document.querySelector('[data-support-reply-button]').disabled = true;
    document.querySelector('[data-support-close-button]').disabled = true;
    document.querySelector('[data-support-delete-button]').disabled = true;
    document.getElementById('support-ticket-controls').hidden = true;
    await loadSupportInbox();
}

async function saveSupportSettings(event) {
    event.preventDefault();
    if (!hasAdminPermission('support.update')) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bot_wait_seconds: Number(document.getElementById('support-bot-wait').value)
        })
    });
    const result = await response.json();
    document.getElementById('support-chat-status').textContent = response.ok
        ? 'Support settings saved.'
        : (result.error || 'Support settings could not be saved.');
}

async function setSupportPresence(online) {
    if (!hasAdminPermission('support.update')) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        document.getElementById('support-chat-status').textContent = result.error || 'Availability could not be updated.';
    }
}

function renderSupportFaqs(faqs) {
    const tbody = document.querySelector('#support-faq-table tbody');
    const buttons = hasAdminPermission('support.update');
    tbody.innerHTML = faqs.map(faq => `
        <tr>
            <td>${escapeAdminHtml(faq.question)}</td>
            <td>${escapeAdminHtml(faq.keywords)}</td>
            <td>${Number(faq.is_active) === 1 ? 'Active' : 'Inactive'}</td>
            <td>${buttons ? `<button type="button" class="admin-btn" data-csp-click="editSupportFaq" data-faq-id="${Number(faq.id)}">Edit</button>
                <button type="button" class="admin-btn" data-csp-click="deleteSupportFaq" data-faq-id="${Number(faq.id)}">Delete</button>` : ''}</td>
        </tr>`).join('');
}

async function loadSupportFaqs() {
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=admin_faq`);
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.error || 'FAQ entries could not be loaded.');
    }
    renderSupportFaqs(result.data || []);
}

async function saveSupportFaq(event) {
    event.preventDefault();
    if (!hasAdminPermission('support.update')) return;
    const id = Number(document.getElementById('support-faq-id').value) || null;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=faq_save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id,
            question: document.getElementById('support-faq-question').value,
            answer: document.getElementById('support-faq-answer').value,
            keywords: document.getElementById('support-faq-keywords').value,
            is_active: document.getElementById('support-faq-active').checked
        })
    });
    const result = await response.json();
    const status = document.getElementById('support-faq-status');
    status.textContent = response.ok ? 'FAQ answer saved.' : (result.error || 'FAQ answer could not be saved.');
    if (response.ok) {
        document.getElementById('support-faq-form').reset();
        document.getElementById('support-faq-id').value = '';
        document.getElementById('support-faq-active').checked = true;
        await loadSupportFaqs();
    }
}

function editSupportFaq(id) {
    if (!hasAdminPermission('support.update')) return;
    adminFetch(`${API_BASE}/support-chat.php?action=admin_faq`)
        .then(response => response.json())
        .then(result => {
            const faq = (result.data || []).find(item => Number(item.id) === id);
            if (!faq) return;
        document.getElementById('support-faq-id').value = faq.id;
        document.getElementById('support-faq-question').value = faq.question;
        document.getElementById('support-faq-answer').value = faq.answer;
        document.getElementById('support-faq-keywords').value = faq.keywords;
        document.getElementById('support-faq-active').checked = Number(faq.is_active) === 1;
        document.getElementById('support-faq-question').focus();
        })
        .catch(error => {
            document.getElementById('support-faq-status').textContent = error.message;
        });
}

async function deleteSupportFaq(id) {
    if (!hasAdminPermission('support.update') || !Number.isSafeInteger(id) || id < 1) return;
    const response = await adminFetch(`${API_BASE}/support-chat.php?action=faq_delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    const result = await response.json();
    document.getElementById('support-faq-status').textContent = response.ok
        ? 'FAQ answer deleted.'
        : (result.error || 'FAQ answer could not be deleted.');
    if (response.ok) await loadSupportFaqs();
}

function resetSupportFaq() {
    document.getElementById('support-faq-form').reset();
    document.getElementById('support-faq-id').value = '';
    document.getElementById('support-faq-active').checked = true;
}

function renderAdminInsights(moduleName, metrics, distribution = []) {
    const supportScreen = ['feedback', 'delivery'].includes(moduleName);
    const screen = document.getElementById(`mod-${supportScreen ? 'orders' : moduleName}`);
    if (!screen) return;
    let panel = document.getElementById(`insights-${moduleName}`);
    if (!panel) {
        panel = document.createElement('section');
        panel.id = `insights-${moduleName}`;
        panel.className = 'admin-insights';
        panel.setAttribute('aria-label', `${moduleName} metrics and chart`);
        const anchor = supportScreen
            ? document.getElementById(moduleName === 'feedback' ? 'feedback-admin-status' : 'notification-log-status')
            : screen.children[1];
        const insertionPoint = supportScreen ? anchor?.closest('section') : anchor;
        screen.insertBefore(panel, insertionPoint || null);
    }
    const chartItems = distribution.slice(0, 7);
    const values = chartItems.map(item => Math.max(0, Number(item.value) || 0));
    const max = Math.max(1, ...values);
    panel.innerHTML = `
        ${metrics.map(metric => `<div class="admin-insight-card"><div class="admin-insight-label">${escapeAdminHtml(metric.label)}</div><div class="admin-insight-value">${escapeAdminHtml(metric.value)}</div></div>`).join('')}
        ${chartItems.length ? `<div class="admin-chart" role="img" aria-label="${escapeAdminHtml(chartItems.map(item => `${item.label}: ${item.value}`).join(', '))}">
            ${chartItems.map((item, index) => {
                const amount = Math.max(0, Number(item.value) || 0);
                const width = Math.max(amount > 0 ? 3 : 0, Math.round(amount / max * 100));
                return `<div class="admin-chart-row"><span>${escapeAdminHtml(item.label)}</span><div class="admin-chart-track"><div class="admin-chart-fill" style="width:${width}%;opacity:${Math.max(.58, 1 - index * .045)}"></div></div><strong>${escapeAdminHtml(item.display ?? amount)}</strong></div>`;
            }).join('')}
        </div>` : ''}
    `;
}

function applyAdminPermissions() {
    const isSuperAdmin = adminPermissions?.includes('*.*') === true;
    document.querySelectorAll('[data-super-admin-only]').forEach(element => {
        element.hidden = !isSuperAdmin;
    });
    document.querySelectorAll('[data-admin-module]').forEach(element => {
        const permission = ADMIN_MODULE_READ_PERMISSIONS[element.dataset.adminModule];
        element.hidden = (element.hasAttribute('data-super-admin-only') && !isSuperAdmin)
            || !permission || !hasAdminPermission(permission);
    });
    document.querySelectorAll('[data-admin-permission]').forEach(element => {
        element.hidden = !hasAdminPermission(element.dataset.adminPermission);
    });
    const couponForm = document.getElementById('coupon-form');
    if (couponForm) {
        couponForm.hidden = !hasAdminPermission('coupons.create')
            && !hasAdminPermission('coupons.update');
    }
    const categoryForm = document.getElementById('category-admin-form');
    if (categoryForm) {
        categoryForm.hidden = !hasAdminPermission('categories.create')
            && !hasAdminPermission('categories.update');
    }
}

async function loadAdminPermissions() {
    const response = await adminFetch(`${API_BASE}/auth?action=admin_permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });
    const result = await response.json();
    const permissions = result?.data?.permissions;
    if (!response.ok || result.status !== 'success' || !Array.isArray(permissions)
        || permissions.some(permission => typeof permission !== 'string')) {
        throw new Error('Could not load admin permissions. Please sign in again.');
    }
    adminPermissions = adminMustChangePassword ? [] : permissions;
    applyAdminPermissions();
}

async function loadAdminSession() {
    const response = await adminFetch(`${API_BASE}/auth?action=admin_session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success'
        || typeof result?.data?.must_change_password !== 'boolean') {
        throw new Error('Could not verify your admin session. Please sign in again.');
    }
    adminMustChangePassword = result.data.must_change_password;
}

function showAdminPasswordChangeRequired() {
    const panel = document.getElementById('admin-password-panel');
    panel.classList.add('active');
    panel.style.display = 'block';
    const error = document.getElementById('admin-password-error');
    error.textContent = 'Set a new password before using any admin features.';
    error.style.display = 'block';
}

async function refreshAdminAuthorization() {
    const session = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!session) {
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        showAdminLogin('Your admin session expired. Please sign in again.');
        return;
    }
    if (adminPermissionRefreshPromise) return adminPermissionRefreshPromise;

    const refresh = (async () => {
        const previousPermissions = Array.isArray(adminPermissions) ? [...adminPermissions] : null;
        try {
            await loadAdminSession();
            if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== session) return;
            await loadAdminPermissions();
            if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== session) {
                adminPermissions = null;
                closeModule();
                applyAdminPermissions();
                return;
            }
            const permissionsChanged = previousPermissions === null
                || previousPermissions.length !== adminPermissions.length
                || previousPermissions.some(permission => !adminPermissions.includes(permission));
            if (permissionsChanged || adminMustChangePassword) closeModule();
            if (adminMustChangePassword) showAdminPasswordChangeRequired();
        } catch (error) {
            adminPermissions = null;
            closeModule();
            applyAdminPermissions();
        }
    })();
    adminPermissionRefreshPromise = refresh;
    try {
        await refresh;
    } finally {
        if (adminPermissionRefreshPromise === refresh) adminPermissionRefreshPromise = null;
    }
}

function startAdminPermissionRefresh() {
    if (adminPermissionRefreshStarted) return;
    adminPermissionRefreshStarted = true;
    adminFocusRefreshHandler = () => { void refreshAdminAuthorization(); };
    adminVisibilityRefreshHandler = () => {
        if (!document.hidden) void refreshAdminAuthorization();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', adminFocusRefreshHandler);
    }
    document.addEventListener('visibilitychange', adminVisibilityRefreshHandler);
    if (typeof setInterval === 'function') {
        adminPermissionRefreshTimer = setInterval(() => {
            if (!document.hidden) void refreshAdminAuthorization();
        }, 60000);
    }
}

function stopAdminPermissionRefresh() {
    if (adminPermissionRefreshTimer !== null && typeof clearInterval === 'function') {
        clearInterval(adminPermissionRefreshTimer);
    }
    adminPermissionRefreshTimer = null;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function'
        && adminFocusRefreshHandler) {
        window.removeEventListener('focus', adminFocusRefreshHandler);
    }
    if (adminVisibilityRefreshHandler) {
        document.removeEventListener('visibilitychange', adminVisibilityRefreshHandler);
    }
    adminFocusRefreshHandler = null;
    adminVisibilityRefreshHandler = null;
    adminPermissionRefreshStarted = false;
}

function initializeAdminSessionBroadcast() {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;
    try {
        adminSessionChannel = new window.BroadcastChannel('wc-admin-session');
        adminSessionChannel.onmessage = event => {
            if (event.data?.type === 'session-invalidated'
                && sessionStorage.getItem(ADMIN_SESSION_KEY)) {
                return handleAdminLogout(false).catch(() => {});
            }
        };
    } catch (error) {
        adminSessionChannel = null;
    }
}

function notifyOtherAdminTabsOfInvalidation() {
    if (!adminSessionChannel) return;
    try {
        adminSessionChannel.postMessage({ type: 'session-invalidated' });
    } catch (error) {
        adminSessionChannel = null;
    }
}

function createIdempotencyKey() {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || !cryptoApi.getRandomValues) {
        throw new Error('Secure request keys are unavailable in this browser.');
    }
    return Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

function showAdminLogin(message = '') {
    stopAdminPermissionRefresh();
    adminPermissions = null;
    adminMustChangePassword = false;
    document.getElementById('admin-login-screen').style.display = 'block';
    document.getElementById('admin-app').style.display = 'none';
    document.getElementById('admin-user-name').textContent = 'Not signed in';
    document.getElementById('admin-change-password').style.display = 'none';
    document.getElementById('admin-logout').style.display = 'none';
    const error = document.getElementById('admin-login-error');
    error.textContent = message;
    error.style.display = message ? 'block' : 'none';
}

function showAdminApp(name) {
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'block';
    document.getElementById('admin-password-panel').classList.remove('active');
    document.getElementById('admin-password-panel').style.display = 'none';
    document.getElementById('admin-user-name').textContent = `Signed in: ${name || 'Admin'}`;
    document.getElementById('admin-change-password').style.display = 'inline-block';
    document.getElementById('admin-logout').style.display = 'inline-block';
}

function toggleAdminPasswordPanel() {
    const panel = document.getElementById('admin-password-panel');
    panel.classList.toggle('active');
    panel.style.display = panel.classList.contains('active') ? 'block' : 'none';
}

async function handleAdminPasswordChange(event) {
    event.preventDefault();
    const error = document.getElementById('admin-password-error');
    const newPassword = document.getElementById('admin-new-password').value;
    if (newPassword !== document.getElementById('admin-confirm-password').value) {
        error.textContent = 'The new passwords do not match.';
        error.style.display = 'block';
        return;
    }

    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_change_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: document.getElementById('admin-current-password').value,
                new_password: newPassword
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            error.textContent = result.error || 'Could not change the admin password.';
            error.style.display = 'block';
            return;
        }

        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
        adminMustChangePassword = false;
        notifyOtherAdminTabsOfInvalidation();
        await loadAdminPermissions();
        document.getElementById('admin-password-panel').querySelector('form').reset();
        document.getElementById('admin-password-panel').classList.remove('active');
        document.getElementById('admin-password-panel').style.display = 'none';
        alert('Admin password updated. Other active sessions have been signed out.');
    } catch (e) {
        error.textContent = e.message || 'Could not connect to the authentication service.';
        error.style.display = 'block';
    }
}

async function adminFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('X-WC-Admin-Client', 'web');

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin',
        signal: options.signal || AbortSignal.timeout(ADMIN_REQUEST_TIMEOUT_MS)
    });
    if (response.status === 401) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        showAdminLogin('Your admin session expired. Please sign in again.');
    } else if (response.status === 403
        && !url.includes('/auth?action=admin_session')
        && !url.includes('/auth?action=admin_permissions')) {
        await refreshAdminAuthorization();
    }
    return response;
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const button = document.getElementById('admin-login-button');
    const error = document.getElementById('admin-login-error');
    const form = document.getElementById('admin-login-form');
    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = 'Signing in…';
    error.style.display = 'none';
    error.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth?action=admin_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-WC-Admin-Client': 'web' },
            credentials: 'same-origin',
            signal: AbortSignal.timeout(ADMIN_REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
                username: document.getElementById('admin-username').value.trim(),
                password: document.getElementById('admin-password').value,
                totp_code: document.getElementById('admin-totp-code').value.trim()
            })
        });
        let result;
        try {
            result = await response.json();
        } catch (parseError) {
            throw new Error(response.ok
                ? 'The sign-in service returned an unexpected response. Please try again.'
                : `The sign-in service is temporarily unavailable (HTTP ${response.status}). Please try again shortly.`);
        }
        if (!response.ok || result.status !== 'success') {
            const retryAfter = Number(response.headers.get('Retry-After'));
            error.textContent = response.status === 401
                ? 'Incorrect username, password, or authenticator code.'
                : response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
                    ? `${result.error || 'Too many sign-in attempts.'} Try again in about ${Math.ceil(retryAfter / 60)} minutes.`
                    : result.error || 'Admin sign in failed. Check your details and try again.';
            error.style.display = 'block';
            return;
        }

        if (typeof result?.data?.full_name !== 'string'
            || typeof result?.data?.must_change_password !== 'boolean') {
            throw new Error('The sign-in service returned incomplete session details. Please contact the store owner.');
        }
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
        sessionStorage.setItem(ADMIN_NAME_KEY, result.data.full_name);
        adminMustChangePassword = result.data.must_change_password === true;
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-totp-code').value = '';
        form.reset();
        await loadAdminPermissions();
        showAdminApp(result.data.full_name);
        startAdminPermissionRefresh();
        if (result.data.must_change_password) {
            showAdminPasswordChangeRequired();
        }
    } catch (e) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        adminPermissions = null;
        adminMustChangePassword = false;
        error.textContent = e instanceof TypeError || e?.name === 'AbortError' || e?.name === 'TimeoutError'
            ? 'Server unreachable. Check your connection and try again.'
            : e.message || 'Could not connect to the authentication service.';
        error.style.display = 'block';
    } finally {
        button.disabled = false;
        button.textContent = originalButtonText;
    }
}

async function handleAdminLogout(broadcast = true) {
    if (broadcast && adminSessionChannel) {
        notifyOtherAdminTabsOfInvalidation();
    }
    try {
        await adminFetch(`${API_BASE}/auth?action=admin_logout`, { method: 'POST' });
    } finally {
        stopAdminPermissionRefresh();
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        adminPermissions = null;
        showAdminLogin('You have signed out.');
    }
}

async function initializeAdmin() {
    const session = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!session) {
        showAdminLogin();
        return;
    }

    try {
        await loadAdminSession();
        await loadAdminPermissions();
        showAdminApp(sessionStorage.getItem(ADMIN_NAME_KEY));
        startAdminPermissionRefresh();
        startSupportNotificationPolling();
        if (adminMustChangePassword) showAdminPasswordChangeRequired();
    } catch (e) {
        showAdminLogin(e.message || 'Could not verify your admin session.');
    }
}

function formatBDT(amount) {
    const value = Number(amount || 0);
    return '৳' + (Number.isFinite(value) ? value : 0).toLocaleString('en-BD');
}

function escapeAdminHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function isSafeHomepageUrl(url) {
    if (typeof url !== 'string') return false;
    const value = url.trim();
    if (!value || value.length > 1000 || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
    if (/^https?:\/\//i.test(value)) {
        try {
            return ['http:', 'https:'].includes(new URL(value).protocol);
        } catch (error) {
            return false;
        }
    }
    return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

const ADMIN_NAVIGATION_PAGES = [
    { id: 'home', label: 'Home' },
    { id: 'shop', label: 'Shop / Catalog' },
    { id: 'search', label: 'Search' },
    { id: 'offers', label: 'Offers & Deals' },
    { id: 'track-order', label: 'Track Order' },
    { id: 'orders', label: 'My Orders' },
    { id: 'contact', label: 'Contact' },
    { id: 'about', label: 'About Us' },
    { id: 'faq', label: 'FAQ' },
    { id: 'shipping-policy', label: 'Shipping & Delivery' },
    { id: 'refund-policy', label: 'Returns & Refunds' },
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'terms', label: 'Terms & Conditions' },
    { id: 'cookie-policy', label: 'Cookie Policy' },
    { id: 'login', label: 'Sign In / Register' },
    { id: 'forgot-password', label: 'Forgot Password' },
    { id: 'reset-password', label: 'Reset Password' },
    { id: 'verify-email', label: 'Verify Email' },
    { id: 'resend-verification', label: 'Resend Verification' },
    { id: 'profile', label: 'My Account' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'cart', label: 'Shopping Cart' },
    { id: 'checkout', label: 'Checkout' },
    { id: 'order-success', label: 'Order Confirmation' }
];

function formatDeliveryArea(area, fee) {
    const label = String(area || '').trim();
    if (label === 'Local Dhaka') {
        return 'Inside Dhaka';
    }
    if (['Inside Dhaka', 'Outside Dhaka'].includes(label)) return label;
    return Number(fee) === 60 ? 'Inside Dhaka' : label;
}

function safeAdminImage(value) {
    if (typeof value !== 'string') return 'assets/product-placeholder.svg';
    if (/^assets\/(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9._/-]+$/i.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : 'assets/product-placeholder.svg';
    } catch (error) {
        return 'assets/product-placeholder.svg';
    }
}

function openModule(moduleName) {
    const permission = ADMIN_MODULE_READ_PERMISSIONS[moduleName];
    if (!permission || !hasAdminPermission(permission)) return false;
    if (moduleName === 'team' && !adminPermissions?.includes('*.*')) return false;

    document.getElementById('main-admin-grid').style.display = 'none';
    document.querySelectorAll('.admin-module-screen').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`mod-${moduleName}`);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        switch (moduleName) {
            case 'dashboard': loadAdminModuleData(moduleName, loadDashboard); break;
            case 'products': loadAdminModuleData(moduleName, loadProducts); break;
            case 'categories': loadAdminModuleData(moduleName, loadCategories); break;
            case 'orders':
                loadAdminModuleData(moduleName, loadOrders);
                if (hasAdminPermission('feedback.read')) void loadFeedback();
                void loadNotificationLogs();
                break;
            case 'customers': loadAdminModuleData(moduleName, loadCustomers); break;
            case 'coupons': loadAdminModuleData(moduleName, loadCoupons); break;
            case 'inventory': loadAdminModuleData(moduleName, loadInventory); break;
            case 'reports': loadAdminModuleData(moduleName, loadReports); break;
            case 'settings': loadAdminModuleData(moduleName, loadSettings); break;
            case 'support': loadAdminModuleData(moduleName, loadSupportInbox); break;
            case 'team': loadAdminModuleData(moduleName, loadStaffManagement); break;
            case 'audit': loadAdminModuleData(moduleName, loadAuditLog); break;
        }
    }
    return true;
}

function loadAdminModuleData(moduleName, loader) {
    const screen = document.getElementById(`mod-${moduleName}`);
    const errorId = `module-load-error-${moduleName}`;
    void Promise.resolve().then(loader).then(() => {
        document.getElementById(errorId)?.remove();
    }).catch(error => {
        if (!screen) return;
        document.getElementById(`insights-${moduleName}`)?.replaceChildren();
        let status = document.getElementById(errorId);
        if (!status) {
            status = document.createElement('p');
            status.id = errorId;
            status.className = 'admin-module-error';
            status.setAttribute('role', 'alert');
            screen.insertBefore(status, screen.children[1] || null);
        }
        status.textContent = error.message || 'This section could not be loaded.';
    });
}

function closeModule() {
    document.querySelectorAll('.admin-module-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('main-admin-grid').style.display = 'grid';
}

// 1. DASHBOARD
async function loadDashboard(event) {
    event?.preventDefault();
    try {
        const from = document.getElementById('dashboard-from').value;
        const to = document.getElementById('dashboard-to').value;
        if ((from && !to) || (!from && to)) {
            throw new Error('Choose both dates to filter dashboard metrics.');
        }
        const params = new URLSearchParams();
        if (from && to) {
            params.set('from', from);
            params.set('to', to);
        }
        const queryString = params.toString();
        const query = queryString ? `?${queryString}` : '';
        const res = await adminFetch(`${API_BASE}/reports${query}`);
        const json = await res.json();
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Could not load dashboard metrics.');
        const ov = json.data.overview;
        renderAdminInsights('dashboard', [], (json.data.status_breakdown || []).map(item => ({
            label: item.order_status, value: Number(item.count) || 0
        })));
        document.getElementById('dash-status').textContent = '';

        document.getElementById('dash-kpi-cards').innerHTML = `
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <div style="font-size: 0.8rem; color: #b8b0a3;">Total Revenue</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #10b981;">${formatBDT(ov.paid_order_revenue)}</div>
            </div>
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <div style="font-size: 0.8rem; color: #b8b0a3;">Total Orders</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #dec28f;">${Number(ov.total_orders) || 0}</div>
            </div>
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <div style="font-size: 0.8rem; color: #b8b0a3;">Average Order (AOV)</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #dec28f;">${formatBDT(ov.average_paid_order_value)}</div>
            </div>
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <div style="font-size: 0.8rem; color: #b8b0a3;">Customers</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #a78bfa;">${Number(ov.total_customers) || 0}</div>
            </div>
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <div style="font-size: 0.8rem; color: #b8b0a3;">Low Stock Alerts</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #ef4444;">${Number(ov.low_stock_alerts) || 0} Products</div>
            </div>
        `;

        const tbody = document.querySelector('#dash-orders-table tbody');
        tbody.innerHTML = (json.data.recent_orders || []).map(o => `
            <tr>
                <td style="font-weight: 800; color: #dec28f;">${escapeAdminHtml(o.order_number)}</td>
                <td>${escapeAdminHtml(o.customer_name)}</td>
                <td>${escapeAdminHtml(formatDeliveryArea(o.delivery_area, o.delivery_fee))}</td>
                <td style="font-weight: 700;">${formatBDT(o.total)}</td>
                <td><span style="color: #dec28f; font-weight: 700;">● ${escapeAdminHtml(o.order_status)}</span></td>
                <td>${hasAdminPermission('orders.read') ? '<button data-csp-click="openModule" data-csp-value="orders" class="admin-btn" style="padding: 4px 10px; font-size: 0.75rem;">Manage</button>' : ''}</td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('dash-status').textContent = e.message || 'Could not load dashboard data.';
        console.error('Dashboard load failed:', e);
    }
}

function resetDashboardRange() {
    document.getElementById('dashboard-from').value = '';
    document.getElementById('dashboard-to').value = '';
    void loadDashboard();
}

// 2. PRODUCTS
async function loadProducts() {
    const res = await adminFetch(`${API_BASE}/products?include_unavailable=1`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Could not load products.');
    }
    const products = json.data || [];
    renderAdminInsights('products', [
        { label: 'Products', value: products.length },
        { label: 'For sale', value: products.filter(product => Number(product.is_sellable) === 1).length },
        { label: 'Low stock', value: products.filter(product => Number(product.stock_quantity) > 0 && Number(product.stock_quantity) <= 5).length },
        { label: 'Out of stock', value: products.filter(product => Number(product.stock_quantity) <= 0).length }
    ], [
        { label: 'Healthy stock', value: products.filter(product => Number(product.stock_quantity) > 5).length },
        { label: 'Low stock', value: products.filter(product => Number(product.stock_quantity) > 0 && Number(product.stock_quantity) <= 5).length },
        { label: 'Out of stock', value: products.filter(product => Number(product.stock_quantity) <= 0).length }
    ]);
    productsById = new Map(products.map(product => [Number(product.id), product]));
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = products.map(p => `
        <tr>
            <td><img src="${escapeAdminHtml(safeAdminImage(Array.isArray(p.images) && p.images.length ? p.images[0] : p.image))}" alt="${escapeAdminHtml(p.name)}" width="44" height="44" loading="lazy" data-image-fallback="assets/product-placeholder.svg" style="border-radius: 6px; object-fit: cover;"></td>
            <td style="font-weight: 700; color: #f7f4ee;">${escapeAdminHtml(p.name)}</td>
            <td style="color: #b8b0a3;">${escapeAdminHtml(p.category_name)}</td>
            <td>${formatBDT(p.regular_price)}</td>
            <td style="color: #806338; font-weight: 700;">${p.sale_price ? formatBDT(p.sale_price) : '-'}</td>
            <td style="font-weight: 700;">${p.stock_quantity}</td>
            <td>${Number(p.is_sellable) === 1 ? 'For sale' : 'Not for sale'}</td>
            <td style="white-space: nowrap;">
                ${hasAdminPermission('products.update') ? `<button type="button" data-csp-click="editProduct" data-product-id="${Number(p.id)}" class="admin-btn" style="padding: 4px 10px; font-size: 0.78rem;">Edit</button>` : ''}
                ${hasAdminPermission('products.archive') ? `<button type="button" data-csp-click="deleteProduct" data-product-id="${Number.isSafeInteger(Number(p.id)) ? Number(p.id) : 0}" style="border: none; background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function showAddProductModal() {
    if (!hasAdminPermission('products.create')) return;
    const form = document.getElementById('product-create-form');
    const isOpening = form.style.display === 'none';
    if (!isOpening) {
        hideProductForm();
        return;
    }

    await prepareProductForm(null);
}

function hideProductForm() {
    const form = document.getElementById('product-create-form');
    form.style.display = 'none';
    form.reset();
    productImages = [];
    selectedProductFiles = [];
    renderProductImagePreview();
}

async function prepareProductForm(product) {
    const form = document.getElementById('product-create-form');
    form.reset();
    form.style.display = 'block';
    const status = document.getElementById('product-create-status');
    status.textContent = '';
    status.style.display = 'none';
    document.getElementById('new-product-id').value = product ? String(product.id) : '';
    document.getElementById('new-product-expected-stock').value = product ? String(product.stock_quantity ?? 0) : '';
    document.getElementById('product-form-title').textContent = product ? 'Edit product' : 'Add a product';
    document.getElementById('product-create-submit').textContent = product ? 'Save Product Changes' : 'Save Product';
    productImages = Array.isArray(product?.images) ? [...product.images] : [];
    selectedProductFiles = [];

    try {
        const response = await adminFetch(`${API_BASE}/categories`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not load product categories.');
        }

        const categorySelect = document.getElementById('new-product-category');
        categorySelect.replaceChildren(new Option('Choose a category', ''));
        (result.data || []).forEach(category => {
            categorySelect.add(new Option(category.name, category.id));
        });
        if (!result.data || result.data.length === 0) {
            throw new Error('Create a category before adding products.');
        }
        if (product) {
            document.getElementById('new-product-name').value = product.name || '';
            categorySelect.value = String(product.category_id || '');
            document.getElementById('new-product-price').value = product.regular_price ?? '';
            document.getElementById('new-product-sale-price').value = product.sale_price ?? '';
            document.getElementById('new-product-stock').value = product.stock_quantity ?? 0;
            document.getElementById('new-product-sku').value = product.sku || '';
            document.getElementById('new-product-description').value = product.short_desc || '';
            document.getElementById('new-product-long-description').value = product.description || '';
            document.getElementById('new-product-seo-title').value = product.seo_title || '';
            document.getElementById('new-product-meta-description').value = product.meta_description || '';
            document.getElementById('new-product-focus-keyword').value = product.focus_keyword || '';
            document.getElementById('new-product-h1').value = product.h1 || '';
            document.getElementById('new-product-alt-text').value = product.alt_text || '';
            document.getElementById('new-product-canonical-url').value = product.canonical_url || '';
            document.getElementById('new-product-featured').checked = Number(product.is_featured) === 1;
            document.getElementById('new-product-trending').checked = Number(product.is_trending) === 1;
            document.getElementById('new-product-sellable').checked = Number(product.is_sellable) === 1;
        }
        renderProductImagePreview();
        document.getElementById('new-product-name').focus();
    } catch (error) {
        status.textContent = error.message || 'Could not load product categories.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    }
}

function exportProductsCsv() {
    if (!hasAdminPermission('products.read')) return;
    const csvCell = value => {
        let text = value === null || value === undefined ? '' : String(value);
        if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const products = [...productsById.values()];
    const rows = [
        ['ID', 'Name', 'SKU', 'Category', 'Regular price (BDT)', 'Sale price (BDT)', 'Stock', 'For sale', 'Description', 'SEO title', 'Meta description'],
        ...products.map(product => [
            product.id, product.name, product.sku, product.category_name,
            product.regular_price, product.sale_price, product.stock_quantity,
            Number(product.is_sellable) === 1 ? 'Yes' : 'No',
            product.description, product.seo_title, product.meta_description
        ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function editProduct(id) {
    if (!hasAdminPermission('products.update')) return;
    const product = productsById.get(Number(id));
    if (!product) {
        alert('Product details are not loaded. Refresh the product list and try again.');
        return;
    }
    prepareProductForm(product);
}

function handleProductImageSelection(event) {
    if (!hasAdminPermission('products.images.upload')) return;
    const files = Array.from(event.target.files || []);
    const status = document.getElementById('product-create-status');
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) || file.size <= 0 || file.size > 1500000)) {
        event.target.value = '';
        selectedProductFiles = [];
        status.textContent = 'Choose JPEG, PNG, or WebP photos smaller than 1.5 MB each.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        renderProductImagePreview();
        return;
    }
    if (productImages.length + files.length > 10) {
        event.target.value = '';
        selectedProductFiles = [];
        status.textContent = 'A product can have up to ten photos total.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        renderProductImagePreview();
        return;
    }
    selectedProductFiles = files;
    status.textContent = '';
    status.style.display = 'none';
    renderProductImagePreview();
}

function renderProductImagePreview() {
    productPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    productPreviewUrls = [];
    const preview = document.getElementById('product-image-preview');
    if (!preview) return;
    preview.replaceChildren();

    const renderImage = (source, label, onRemove) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:84px;';
        const image = document.createElement('img');
        image.src = source;
        image.alt = label;
        image.width = 80;
        image.height = 80;
        image.style.cssText = 'object-fit:cover;border-radius:6px;border:1px solid #625d54;';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${label}`);
        remove.style.cssText = 'position:absolute;top:2px;right:4px;border:0;border-radius:50%;background:#dc2626;color:#fff;width:22px;height:22px;cursor:pointer;';
        remove.addEventListener('click', onRemove);
        wrapper.append(image, remove);
        preview.appendChild(wrapper);
    };

    productImages.forEach((image, index) => {
        renderImage(safeAdminImage(image), `Current product photo ${index + 1}`, () => {
            productImages.splice(index, 1);
            renderProductImagePreview();
        });
    });
    selectedProductFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        productPreviewUrls.push(url);
        renderImage(url, `New product photo ${index + 1}`, () => {
            selectedProductFiles.splice(index, 1);
            document.getElementById('new-product-images').value = '';
            renderProductImagePreview();
        });
    });
}

async function uploadProductImages(files) {
    if (!hasAdminPermission('products.images.upload')) {
        throw new Error('You are not authorized to upload product photos.');
    }
    const uploaded = [];
    for (let offset = 0; offset < files.length; offset += 5) {
        const body = new FormData();
        files.slice(offset, offset + 5).forEach(file => body.append('images[]', file));
        const response = await adminFetch(`${API_BASE}/product-images.php`, { method: 'POST', body });
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !Array.isArray(result.data?.images)) {
            throw new Error(result.error || 'Could not upload product photos.');
        }
        uploaded.push(...result.data.images);
    }
    return uploaded;
}

async function handleAddProduct(event) {
    event.preventDefault();
    const form = document.getElementById('product-create-form');
    const status = document.getElementById('product-create-status');
    const submit = document.getElementById('product-create-submit');
    const price = Number(document.getElementById('new-product-price').value);
    const salePriceInput = document.getElementById('new-product-sale-price').value;
    const salePrice = salePriceInput === '' ? null : Number(salePriceInput);
    const productId = document.getElementById('new-product-id').value;
    if (!hasAdminPermission(productId ? 'products.update' : 'products.create')) return;

    if (!Number.isFinite(price) || price <= 0 || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= price))) {
        status.textContent = 'Enter a valid regular price and a lower sale price.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        return;
    }

    submit.disabled = true;
    status.textContent = '';
    status.style.display = 'none';
    try {
        const uploadedImages = selectedProductFiles.length ? await uploadProductImages(selectedProductFiles) : [];
        const images = [...productImages, ...uploadedImages];
        const payload = {
                ...(productId ? { id: Number(productId) } : {}),
                name: document.getElementById('new-product-name').value.trim(),
                category_id: document.getElementById('new-product-category').value,
                regular_price: price,
                sale_price: salePrice,
                stock_quantity: Number(document.getElementById('new-product-stock').value),
                expected_stock: productId ? Number(document.getElementById('new-product-expected-stock').value) : undefined,
                sku: document.getElementById('new-product-sku').value.trim() || null,
                short_desc: document.getElementById('new-product-description').value.trim(),
                description: document.getElementById('new-product-long-description').value.trim(),
                seo_title: document.getElementById('new-product-seo-title').value.trim(),
                meta_description: document.getElementById('new-product-meta-description').value.trim(),
                focus_keyword: document.getElementById('new-product-focus-keyword').value.trim(),
                h1: document.getElementById('new-product-h1').value.trim(),
                alt_text: document.getElementById('new-product-alt-text').value.trim(),
                canonical_url: document.getElementById('new-product-canonical-url').value.trim(),
                is_featured: document.getElementById('new-product-featured').checked,
                is_trending: document.getElementById('new-product-trending').checked,
                is_sellable: document.getElementById('new-product-sellable').checked,
                images
            };
        const payloadFingerprint = JSON.stringify(payload);
        if (!pendingProductSave || pendingProductSave.fingerprint !== payloadFingerprint) {
            pendingProductSave = { fingerprint: payloadFingerprint, key: createIdempotencyKey() };
        }
        const response = await adminFetch(`${API_BASE}/products${productId ? `?id=${encodeURIComponent(productId)}` : ''}`, {
            method: productId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pendingProductSave.key },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save the product.');
        }
        pendingProductSave = null;

        try {
            await loadProducts();
            hideProductForm();
        } catch (error) {
            hideProductForm();
            alert(`Product was saved, but the product list could not be refreshed: ${error.message}`);
        }
    } catch (error) {
        status.textContent = error.message || 'Could not save the product.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    } finally {
        submit.disabled = false;
    }
}

async function deleteProduct(id) {
    if (!hasAdminPermission('products.archive')) return;
    if (!confirm('Are you sure you want to delete this product?')) return;
    const response = await adminFetch(`${API_BASE}/products?id=${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not delete the product.');
        return;
    }
    await loadProducts();
}

// 3. CATEGORIES
async function loadCategories() {
    const res = await adminFetch(`${API_BASE}/categories`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.error || 'Could not load categories.');
    }
    if (!res.ok || json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.error || 'Could not load categories.');
    }
    categoriesById = new Map(json.data.map(category => [Number(category.id), category]));
    const tbody = document.querySelector('#categories-table tbody');
    renderAdminInsights('categories', [
        { label: 'Categories', value: json.data.length },
        { label: 'Products assigned', value: json.data.reduce((total, category) => total + (Number(category.product_count) || 0), 0) }
    ], [...json.data].sort((a, b) => Number(b.product_count) - Number(a.product_count))
        .slice(0, 6).map(category => ({ label: category.name, value: Number(category.product_count) || 0 })));
    tbody.innerHTML = json.data.map(c => `
        <tr>
            <td style="font-weight: 700; color: #f7f4ee;">
              <span style="display:inline-flex;align-items:center;gap:10px;">
                <img src="${escapeAdminHtml(safeAdminImage(c.image || 'assets/category-placeholder.svg'))}" alt="" width="42" height="42" loading="lazy" style="object-fit:cover;border-radius:8px;">
                ${escapeAdminHtml(c.name)}
              </span>
            </td>
            <td style="color: #b8b0a3;">${escapeAdminHtml(c.slug)}</td>
            <td style="font-weight: 700;">${Number(c.product_count) || 0}</td>
            <td style="white-space:nowrap;">
                ${hasAdminPermission('categories.update') ? `<button type="button" class="admin-btn" data-csp-click="editCategory" data-category-id="${Number(c.id)}">Edit</button>` : ''}
                ${hasAdminPermission('categories.archive') ? `<button type="button" class="admin-btn" data-csp-click="archiveCategory" data-category-id="${Number(c.id)}" style="background:#7f1d1d;color:#fff;">Archive</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function setCategoryStatus(message, isError = false) {
    const status = document.getElementById('category-create-status');
    status.textContent = message;
    status.style.color = isError ? '#fca5a5' : '#86efac';
    status.style.display = message ? 'block' : 'none';
    status.setAttribute('role', isError ? 'alert' : 'status');
}

async function uploadCategoryImage(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())
        || file.size < 1 || file.size > 5_000_000) {
        throw new Error('Choose a JPEG, PNG, or WebP category image smaller than 5 MB.');
    }
    const image = await createImageBitmap(file);
    if (image.width > 8000 || image.height > 8000 || image.width * image.height > 20_000_000) {
        image.close();
        throw new Error('Category images must be no larger than 8,000 x 8,000 pixels or 20 megapixels.');
    }
    const scale = Math.min(1, 1200 / image.width, 900 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
        image.close();
        throw new Error('Category image processing is unavailable in this browser.');
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    const response = await adminFetch(`${API_BASE}/category-images.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_url: dataUrl })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success' || typeof result.data?.path !== 'string') {
        throw new Error(result.error || 'Could not upload the category image.');
    }
    return result.data.path;
}

function handleCategoryImageSelection(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById('new-cat-image-preview');
    preview.replaceChildren();
    selectedCategoryImageUrl = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())
        || file.size < 1 || file.size > 5_000_000) {
        event.target.value = '';
        setCategoryStatus('Choose a JPEG, PNG, or WebP category image smaller than 5 MB.', true);
        return;
    }
    selectedCategoryImageUrl = URL.createObjectURL(file);
    const image = document.createElement('img');
    image.src = selectedCategoryImageUrl;
    image.alt = 'Selected category image preview';
    image.width = 120;
    image.height = 90;
    image.style.cssText = 'object-fit:cover;border-radius:8px;border:1px solid #625d54;';
    preview.append(image);
}

async function handleAddCategory() {
    const categoryId = Number(document.getElementById('new-cat-id').value) || 0;
    if (!hasAdminPermission(categoryId ? 'categories.update' : 'categories.create')) return;
    const name = document.getElementById('new-cat-name').value.trim();
    const slug = document.getElementById('new-cat-slug').value.trim();
    const description = document.getElementById('new-cat-description').value.trim();
    const button = document.getElementById('category-create-submit');
    const method = categoryId ? 'PUT' : 'POST';
    if (!name) {
        setCategoryStatus('Category name is required.', true);
        document.getElementById('new-cat-name').focus();
        return;
    }
    if (button.disabled) return;

    button.disabled = true;
    setCategoryStatus(categoryId ? 'Saving category…' : 'Creating category…');
    try {
        const imageFile = document.getElementById('new-cat-image').files[0];
        const image = imageFile ? await uploadCategoryImage(imageFile) : categoryImagePath;
        const response = await adminFetch(`${API_BASE}/categories`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(categoryId ? { id: categoryId } : {}), name, slug, description, image })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not create category.');
        }

        resetCategoryForm();
        setCategoryStatus(categoryId ? 'Category updated.' : 'Category created.');
        try {
            await loadCategories();
        } catch (error) {
            setCategoryStatus(
                `Category was created, but the list could not be refreshed: ${error.message}`,
                true
            );
        }
    } catch (error) {
        setCategoryStatus(error.message || 'Could not create category.', true);
    } finally {
        button.disabled = false;
    }
}

function resetCategoryForm() {
    document.getElementById('new-cat-id').value = '';
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-cat-slug').value = '';
    document.getElementById('new-cat-description').value = '';
    document.getElementById('new-cat-image').value = '';
    document.getElementById('new-cat-image-preview').replaceChildren();
    if (selectedCategoryImageUrl) URL.revokeObjectURL(selectedCategoryImageUrl);
    selectedCategoryImageUrl = '';
    categoryImagePath = 'assets/category-placeholder.svg';
    document.querySelector('#category-admin-form h3').textContent = '+ Add New Category';
    document.getElementById('category-create-submit').textContent = 'Create Category';
    document.getElementById('category-edit-cancel').hidden = true;
    setCategoryStatus('');
}

function editCategory(categoryId) {
    if (!hasAdminPermission('categories.update')) return;
    const category = categoriesById.get(Number(categoryId));
    if (!category) {
        setCategoryStatus('Category details are not loaded. Refresh and try again.', true);
        return;
    }
    document.getElementById('new-cat-id').value = String(category.id);
    document.getElementById('new-cat-name').value = category.name || '';
    document.getElementById('new-cat-slug').value = category.slug || '';
    document.getElementById('new-cat-description').value = category.description || '';
    document.getElementById('new-cat-image').value = '';
    if (selectedCategoryImageUrl) URL.revokeObjectURL(selectedCategoryImageUrl);
    selectedCategoryImageUrl = '';
    categoryImagePath = category.image || 'assets/category-placeholder.svg';
    const preview = document.getElementById('new-cat-image-preview');
    preview.replaceChildren();
    const image = document.createElement('img');
    image.src = safeAdminImage(categoryImagePath);
    image.alt = 'Current category image';
    image.width = 120;
    image.height = 90;
    image.style.cssText = 'object-fit:cover;border-radius:8px;border:1px solid #625d54;';
    preview.append(image);
    document.querySelector('#category-admin-form h3').textContent = `Edit category ${category.name}`;
    document.getElementById('category-create-submit').textContent = 'Save Category';
    document.getElementById('category-edit-cancel').hidden = false;
    document.getElementById('category-admin-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function archiveCategory(categoryId) {
    if (!hasAdminPermission('categories.archive')) return;
    const category = categoriesById.get(Number(categoryId));
    if (!category || !window.confirm(`Archive category "${category.name}"?`)) return;
    try {
        const response = await adminFetch(`${API_BASE}/categories?id=${encodeURIComponent(categoryId)}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Category could not be archived.');
        }
        if (Number(document.getElementById('new-cat-id').value) === Number(categoryId)) {
            resetCategoryForm();
        }
        await loadCategories();
        setCategoryStatus('Category archived.');
    } catch (error) {
        setCategoryStatus(error.message || 'Category could not be archived.', true);
    }
}

// 4. ORDERS
async function loadOrders() {
    const params = new URLSearchParams({ per_page: '100', page: String(ordersPage) });
    const search = document.getElementById('orders-search').value.trim();
    const status = document.getElementById('orders-status-filter').value;
    const paymentStatus = document.getElementById('orders-payment-filter').value;
    if (search) params.set('q', search);
    if (status) params.set('status', status);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    const res = await adminFetch(`${API_BASE}/orders?${params}`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.error || 'Could not load orders.');
    }
    const tbody = document.querySelector('#orders-table tbody');
    ordersForSorting = Array.isArray(json.data) ? json.data : [];
    ordersPageCount = Math.max(1, Math.ceil(Number(json.pagination?.total || 0) / 100));
    ordersPage = Math.min(ordersPage, ordersPageCount);
    document.getElementById('orders-pagination-status').textContent =
        `${ordersPageCount ? ordersPage : 0} / ${ordersPageCount} pages · ${Number(json.pagination?.total) || 0} order(s)`;
    const pageButtons = document.querySelectorAll('#mod-orders [data-csp-click="previousOrdersPage"], #mod-orders [data-csp-click="nextOrdersPage"]');
    if (pageButtons[0]) pageButtons[0].disabled = ordersPage <= 1;
    if (pageButtons[1]) pageButtons[1].disabled = ordersPage >= ordersPageCount;
    const sortMode = document.getElementById('orders-sort')?.value || 'newest';
    const orders = [...ordersForSorting].sort((a, b) => {
        if (sortMode === 'oldest') return Number(a.id) - Number(b.id);
        if (sortMode === 'total_high') return Number(b.total) - Number(a.total);
        if (sortMode === 'total_low') return Number(a.total) - Number(b.total);
        if (sortMode === 'payment') return String(a.payment_status || '').localeCompare(String(b.payment_status || ''));
        if (sortMode === 'order_status') return String(a.order_status || '').localeCompare(String(b.order_status || ''));
        return Number(b.id) - Number(a.id);
    });
    const orderCounts = orders.reduce((counts, order) => {
        const status = String(order.order_status || 'Other');
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
    renderAdminInsights('orders', [
        { label: 'Orders in list', value: orders.length },
        { label: 'Needs attention', value: orders.filter(order => ['Pending', 'Processing'].includes(order.order_status)).length },
        { label: 'Payment review', value: orders.filter(order => order.payment_status === 'Pending Verification').length }
    ], Object.entries(orderCounts).map(([label, value]) => ({ label, value })));
    tbody.innerHTML = orders.map(o => {
        const orderId = Number(o.id);
        const customerPhone = String(o.customer_phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
        const whatsappPhone = customerPhone.replace(/\D/g, '');
        const requiresPaymentReview = o.payment_status === 'Pending Verification'
            || (['bKash', 'Nagad', 'Rocket'].includes(o.payment_method) && o.payment_status !== 'Paid');
        return `
        <tr>
            <td style="font-weight: 800; color: #dec28f;">${escapeAdminHtml(o.order_number)}</td>
            <td>
                <strong>${escapeAdminHtml(o.customer_name)}</strong><br>
                <a href="tel:${escapeAdminHtml(customerPhone)}" style="color: #dec28f; font-size: 0.82rem;">📞 ${escapeAdminHtml(o.customer_phone)}</a> |
                <a href="https://wa.me/${escapeAdminHtml(whatsappPhone)}" target="_blank" rel="noopener noreferrer" style="color: #10b981; font-size: 0.82rem;">💬 WA</a>
            </td>
            <td>${escapeAdminHtml(formatDeliveryArea(o.delivery_area, o.delivery_fee))}</td>
            <td style="font-weight: 800; color: #806338;">${formatBDT(o.total)}</td>
            <td>
                <strong style="color: ${requiresPaymentReview ? '#fca5a5' : '#d6cec1'};">${requiresPaymentReview ? '⚠ HOLD — VERIFY PAYMENT' : escapeAdminHtml(o.payment_status || 'Pending')}</strong>
                ${requiresPaymentReview ? `<br><span style="font-size:0.78rem;color:#fecaca;">${escapeAdminHtml(o.payment_method)}: ${escapeAdminHtml(o.payment_status || 'Pending')}</span>` : ''}
            </td>
            <td><strong style="color: #dec28f;">● ${escapeAdminHtml(o.order_status)}</strong></td>
            <td>
                ${hasAdminPermission('orders.update') ? `<select data-csp-change="updateOrderStatus" data-order-id="${Number.isSafeInteger(orderId) ? orderId : 0}" style="background: #171613; color: #fff; border: 1px solid #514b42; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="">Change Status...</option>
                    <option value="Pending" ${o.order_status==='Pending'?'selected':''}>Pending</option>
                    <option value="Processing" ${o.order_status==='Processing'?'selected':''}>Processing</option>
                    <option value="Shipped" ${o.order_status==='Shipped'?'selected':''}>Shipped</option>
                    <option value="Delivered" ${o.order_status==='Delivered'?'selected':''}>Delivered</option>
                    <option value="Cancelled" ${o.order_status==='Cancelled'?'selected':''}>Cancelled</option>
                </select>` : ''}
            </td>
            <td>
                ${hasAdminPermission('orders.update') ? `<select data-csp-change="updateOrderPaymentStatus" data-order-id="${Number.isSafeInteger(orderId) ? orderId : 0}" style="background: #171613; color: #fff; border: 1px solid #514b42; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="">Select payment status…</option>
                    <option value="Pending" ${o.payment_status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Pending Verification" ${o.payment_status === 'Pending Verification' ? 'selected' : ''}>Pending Verification</option>
                    <option value="Paid" ${o.payment_status === 'Paid' ? 'selected' : ''}>Paid — verified</option>
                    <option value="Failed" ${o.payment_status === 'Failed' ? 'selected' : ''}>Failed</option>
                    <option value="Refunded" ${o.payment_status === 'Refunded' ? 'selected' : ''}>Refunded</option>
                </select>` : ''}
            </td>
            <td><button type="button" class="admin-btn" data-csp-click="openOrderDetails" data-order-id="${Number.isSafeInteger(orderId) ? orderId : 0}">Details</button></td>
        </tr>
    `;
    }).join('');
}

function filterOrders(event) {
    event.preventDefault();
    ordersPage = 1;
    void loadOrders();
}

function changeOrdersPage(delta) {
    const nextPage = ordersPage + delta;
    if (nextPage < 1 || nextPage > ordersPageCount) return;
    ordersPage = nextPage;
    void loadOrders();
}

async function openOrderDetails(orderId) {
    if (!hasAdminPermission('orders.read')) return;
    const order = ordersForSorting.find(item => Number(item.id) === orderId);
    if (!order) {
        window.alert('Order details are not loaded. Refresh the order list and try again.');
        return;
    }
    const items = Array.isArray(order.items) ? order.items : [];
    document.getElementById('order-detail-title').textContent = `Order ${order.order_number}`;
    document.getElementById('order-detail-content').innerHTML = `
        <dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
            <div><dt>Customer</dt><dd>${escapeAdminHtml(order.customer_name)}</dd></div>
            <div><dt>Phone</dt><dd>${escapeAdminHtml(order.customer_phone)}</dd></div>
            <div><dt>Order status</dt><dd>${escapeAdminHtml(order.order_status)}</dd></div>
            <div><dt>Payment</dt><dd>${escapeAdminHtml(order.payment_method)} · ${escapeAdminHtml(order.payment_status)}</dd></div>
            <div><dt>Delivery</dt><dd>${escapeAdminHtml(order.delivery_area)} · ${escapeAdminHtml(order.delivery_address)}</dd></div>
            <div><dt>Total</dt><dd>${formatBDT(order.total)}</dd></div>
        </dl>
        <h4>Items</h4>
        <div style="overflow-x:auto;"><table class="admin-table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead>
            <tbody>${items.map(item => `<tr><td>${escapeAdminHtml(item.product_name)}</td><td>${Number(item.quantity) || 0}</td><td>${formatBDT(item.price)}</td><td>${formatBDT(item.total)}</td></tr>`).join('')}</tbody>
        </table></div>
        ${order.notes ? `<p><strong>Customer note:</strong> ${escapeAdminHtml(order.notes)}</p>` : ''}
        <p><strong>Tracking:</strong> ${escapeAdminHtml(order.tracking_code || 'Not available')}</p>
        <a class="admin-btn" href="${API_BASE}/receipt.php?order=${encodeURIComponent(order.order_number)}&amp;track=${encodeURIComponent(order.tracking_code || '')}" target="_blank" rel="noopener noreferrer">Open / print invoice</a>
        <section style="margin-top:20px;">
            <h4>Internal staff notes</h4>
            <p id="order-admin-notes-status" role="status" aria-live="polite"></p>
            <div id="order-admin-notes-list"></div>
            <form id="order-admin-note-form" data-csp-submit="addOrderAdminNote" ${hasAdminPermission('orders.update') ? '' : 'hidden'} style="display:grid;gap:8px;margin-top:10px;">
                <label for="order-admin-note-input">Add a private note</label>
                <textarea id="order-admin-note-input" class="admin-input" maxlength="2000" rows="3" required></textarea>
                <button type="submit" class="admin-btn">Save note</button>
            </form>
        </section>
    `;
    selectedOrderForNotes = orderId;
    const dialog = document.getElementById('order-detail-dialog');
    if (!dialog.open) dialog.showModal();
    await loadOrderAdminNotes(orderId);
}

async function loadOrderAdminNotes(orderId) {
    const status = document.getElementById('order-admin-notes-status');
    status.textContent = 'Loading internal notes…';
    try {
        const response = await adminFetch(`${API_BASE}/order-notes.php?order_id=${encodeURIComponent(orderId)}`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Internal order notes could not be loaded.');
        }
        document.getElementById('order-admin-notes-list').innerHTML = result.data.map(note => `
            <article style="padding:10px;margin:8px 0;border:1px solid #514b42;border-radius:8px;">
                <strong>${escapeAdminHtml(note.admin_name)}</strong>
                <small style="display:block;color:#b8b0a3;">${escapeAdminHtml(note.created_at)}</small>
                <p style="white-space:pre-wrap;">${escapeAdminHtml(note.note)}</p>
            </article>
        `).join('') || '<p>No internal notes have been added.</p>';
        status.textContent = `${result.data.length} internal note(s).`;
    } catch (error) {
        status.textContent = error.message || 'Internal order notes could not be loaded.';
    }
}

async function addOrderAdminNote(event) {
    event.preventDefault();
    if (!hasAdminPermission('orders.update') || !selectedOrderForNotes) return;
    const input = document.getElementById('order-admin-note-input');
    const note = input.value.trim();
    if (!note) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const response = await adminFetch(`${API_BASE}/order-notes.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: selectedOrderForNotes, note })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'The internal order note could not be saved.');
        }
        input.value = '';
        await loadOrderAdminNotes(selectedOrderForNotes);
    } catch (error) {
        document.getElementById('order-admin-notes-status').textContent =
            error.message || 'The internal order note could not be saved.';
    } finally {
        button.disabled = false;
    }
}

function closeOrderDetails() {
    const dialog = document.getElementById('order-detail-dialog');
    if (dialog.open) dialog.close();
}

async function loadFeedback() {
    if (!hasAdminPermission('feedback.read')) return;
    const status = document.getElementById('feedback-admin-status');
    const tbody = document.querySelector('#feedback-table tbody');
    const filter = document.getElementById('feedback-filter').value;
    status.textContent = 'Loading customer feedback…';
    try {
        const response = await adminFetch(`${API_BASE}/feedback.php?admin=1&status=${encodeURIComponent(filter)}`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not load customer feedback.');
        }
        const feedbackItems = result.data || [];
        const averageRating = feedbackItems.length
            ? feedbackItems.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) / feedbackItems.length
            : 0;
        renderAdminInsights('feedback', [
            { label: 'Feedback items', value: feedbackItems.length },
            { label: 'Average rating', value: `${averageRating.toFixed(1)} / 5` },
            { label: 'Public-approved', value: feedbackItems.filter(item => Number(item.allow_public) === 1 && Number(item.is_approved) === 1).length }
        ], [5, 4, 3, 2, 1].map(rating => ({
            label: `${rating} stars`,
            value: feedbackItems.filter(item => Number(item.rating) === rating).length
        })));
        tbody.innerHTML = feedbackItems.map(feedback => {
            const id = Number(feedback.id);
            const safeId = Number.isSafeInteger(id) && id > 0 ? id : 0;
            const image = feedback.photo_path ? safeAdminImage(feedback.photo_path) : '';
            const publicAllowed = Number(feedback.allow_public) === 1;
            const approved = Number(feedback.is_approved) === 1;
            return `
              <tr>
                <td>${escapeAdminHtml(feedback.order_number)}<br><strong>${escapeAdminHtml(feedback.product_name)}</strong></td>
                <td>${escapeAdminHtml(feedback.customer_name)}<br><span style="color:#d6cec1;">${escapeAdminHtml(feedback.customer_email)}</span></td>
                <td><strong style="color:#dec28f;">${'★'.repeat(Math.max(0, Math.min(5, Number(feedback.rating) || 0)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, Number(feedback.rating) || 0)))}</strong><br>${escapeAdminHtml(feedback.comment)}</td>
                <td>${image ? `<a href="${escapeAdminHtml(image)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAdminHtml(image)}" alt="Customer feedback" loading="lazy" style="width:72px;height:72px;object-fit:cover;border-radius:6px;"></a>` : '—'}</td>
                <td>${publicAllowed ? 'Allowed' : 'Not allowed'}<br>${approved ? 'Approved' : 'Not public'}</td>
                <td>
                  <textarea class="admin-input" data-feedback-reply="${safeId}" maxlength="2000" rows="3" aria-label="Reply to feedback">${escapeAdminHtml(feedback.admin_reply || '')}</textarea>
                  ${hasAdminPermission('feedback.update') ? `<button type="button" class="admin-btn" data-csp-click="replyToFeedback" data-feedback-id="${safeId}" style="margin-top:6px;">Save reply</button>` : ''}
                </td>
                <td>
                  ${hasAdminPermission('feedback.update') && publicAllowed && !approved ? `<button type="button" class="admin-btn" data-csp-click="moderateFeedback" data-feedback-id="${safeId}" data-feedback-action="approve">Approve</button>` : ''}
                  ${hasAdminPermission('feedback.update') && approved ? `<button type="button" class="admin-btn" data-csp-click="moderateFeedback" data-feedback-id="${safeId}" data-feedback-action="hide">Hide</button>` : ''}
                  ${!publicAllowed ? 'Private' : ''}
                </td>
              </tr>
            `;
        }).join('');
        status.textContent = `${feedbackItems.length} feedback item(s).`;
    } catch (error) {
        status.textContent = error.message || 'Could not load customer feedback.';
    }
}

async function updateFeedback(id, action, reply) {
    if (!hasAdminPermission('feedback.update') || !Number.isSafeInteger(id) || id < 1) return;
    const response = await adminFetch(`${API_BASE}/feedback.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...(reply === undefined ? {} : { reply }) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        window.alert(result.error || 'Feedback could not be updated.');
        return;
    }
    await loadFeedback();
}

async function loadNotificationLogs() {
    if (!hasAdminPermission('orders.read')) return;
    const status = document.getElementById('notification-log-status');
    const tbody = document.querySelector('#notification-log-table tbody');
    if (!status || !tbody) return;
    status.textContent = 'Loading delivery log…';
    try {
        const response = await adminFetch(`${API_BASE}/notifications.php?admin=1`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not load the message delivery log.');
        }
        const messages = result.data || [];
        const deliveryStatuses = [...new Set(messages.map(message => String(message.status || 'Unknown')))];
        renderAdminInsights('delivery', [
            { label: 'Delivery records', value: messages.length },
            { label: 'Sent', value: messages.filter(message => String(message.status).toLowerCase() === 'sent').length },
            { label: 'Failed', value: messages.filter(message => String(message.status).toLowerCase() === 'failed').length }
        ], deliveryStatuses.map(status => ({
            label: status,
            value: messages.filter(message => String(message.status || 'Unknown') === status).length
        })));
        tbody.innerHTML = messages.map(message => `
          <tr>
            <td>${escapeAdminHtml(message.order_number)}</td>
            <td>${escapeAdminHtml(message.channel)}<br>${escapeAdminHtml(message.template_name)}</td>
            <td>${escapeAdminHtml(message.recipient)}</td>
            <td>${escapeAdminHtml(message.status)}</td>
            <td>${Number(message.attempts) || 0}</td>
            <td>${escapeAdminHtml(message.last_error || '')}</td>
            <td>${escapeAdminHtml(message.created_at)}${message.sent_at ? `<br>Sent: ${escapeAdminHtml(message.sent_at)}` : ''}</td>
          </tr>
        `).join('');
        status.textContent = `${messages.length} message record(s).`;
    } catch (error) {
        status.textContent = error.message || 'Could not load the message delivery log.';
    }
}

async function updateOrderStatus(orderId, newStatus) {
    if (!newStatus || !hasAdminPermission('orders.update')) return;
    const response = await adminFetch(`${API_BASE}/orders`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, order_status: newStatus })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'The order status could not be updated.');
        return;
    }
    alert('Order status updated to ' + newStatus);
    loadOrders();
}

async function updateOrderPaymentStatus(orderId, newStatus) {
    if (!newStatus || !hasAdminPermission('orders.update')) return;
    if (newStatus === 'Paid'
        && !window.confirm('Only mark this payment as Paid after verifying receipt in the provider account. Continue?')) {
        loadOrders();
        return;
    }
    try {
        const response = await adminFetch(`${API_BASE}/orders`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orderId, payment_status: newStatus })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'The payment status could not be updated.');
        }
        await loadOrders();
    } catch (error) {
        alert(error.message || 'The payment status could not be updated.');
        await loadOrders();
        return;
    }
}

// 5. CUSTOMERS
async function loadCustomers() {
    const exportButton = document.getElementById('customers-export');
    if (exportButton) exportButton.disabled = true;
    const res = await adminFetch(`${API_BASE}/customers`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.error || 'Could not load customers.');
    }
    customersForFiltering = Array.isArray(json.data) ? json.data : [];
    if (exportButton) exportButton.disabled = false;
    const customers = customersForFiltering;
    renderAdminInsights('customers', [
        { label: 'Customers in list', value: customers.length },
        { label: 'Repeat customers', value: customers.filter(customer => Number(customer.total_orders) > 1).length },
        { label: 'Customer spend', value: formatBDT(customers.reduce((sum, customer) => sum + (Number(customer.total_spent) || 0), 0)) }
    ], [...customers].sort((a, b) => Number(b.total_orders) - Number(a.total_orders))
        .slice(0, 5).map(customer => ({ label: customer.name, value: Number(customer.total_orders) || 0 })));
    renderCustomerRows();
}

function getFilteredCustomers() {
    const customers = customersForFiltering;
    const search = (document.getElementById('customers-search')?.value || '').trim().toLowerCase();
    const vipFilter = document.getElementById('customers-vip-filter')?.value || '';
    const sortMode = document.getElementById('customers-sort')?.value || 'spent';
    const filtered = customers.filter(customer => {
        const searchable = [customer.name, customer.email, customer.phone, customer.address, customer.area, customer.city]
            .some(value => String(value || '').toLowerCase().includes(search));
        return searchable && (!vipFilter || (vipFilter === 'vip' ? Number(customer.is_vip) === 1 : Number(customer.is_vip) !== 1));
    }).sort((a, b) => {
        if (sortMode === 'orders') return Number(b.total_orders) - Number(a.total_orders);
        if (sortMode === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        if (sortMode === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
        return Number(b.total_spent) - Number(a.total_spent);
    });
    return filtered;
}

function renderCustomerRows() {
    const tbody = document.querySelector('#customers-table tbody');
    const customers = customersForFiltering;
    const filtered = getFilteredCustomers();
    document.getElementById('customers-status').textContent = `Showing ${filtered.length} of ${customers.length} customers.`;
    tbody.innerHTML = filtered.map(c => `
        <tr>
            <td style="font-weight: 700; color: #f7f4ee;">${escapeAdminHtml(c.name)}<br>
                <button type="button" class="admin-btn" data-csp-click="openCustomerProfile" data-customer-id="${Number(c.id)}" style="margin-top:5px;padding:4px 8px;">View profile</button>
            </td>
            <td>${escapeAdminHtml(c.email)}<br><span style="color: #dec28f;">${escapeAdminHtml(c.phone)}</span></td>
            <td>${escapeAdminHtml(c.address || c.area)} (${escapeAdminHtml(c.city)})</td>
            <td style="font-weight: 700;">${Number(c.total_orders) || 0}</td>
            <td style="font-weight: 800; color: #10b981;">${formatBDT(c.total_spent || 0)}</td>
            <td>${Number(c.is_vip) === 1
                ? '<span style="color:#fbbf24;font-weight:800;">VIP</span>'
                : '<span style="color:#b8b0a3;">Regular</span>'}
              ${hasAdminPermission('customers.update') ? `<button type="button" class="admin-btn" data-csp-click="toggleCustomerVip" data-customer-id="${Number(c.id)}" data-is-vip="${Number(c.is_vip) === 1 ? '1' : '0'}" aria-label="${Number(c.is_vip) === 1 ? 'Remove VIP tag from' : 'Mark as VIP'} ${escapeAdminHtml(c.name)}" style="margin-left:6px;padding:4px 8px;">${Number(c.is_vip) === 1 ? 'Remove' : 'Mark VIP'}</button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function openCustomerProfile(customerId) {
    if (!hasAdminPermission('customers.read') || !Number.isSafeInteger(customerId) || customerId < 1) return;
    try {
        const response = await adminFetch(`${API_BASE}/customers?id=${encodeURIComponent(customerId)}`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !result.data) {
            throw new Error(result.error || 'Customer profile could not be loaded.');
        }
        const customer = result.data;
        document.getElementById('customer-profile-title').textContent = `Customer: ${customer.name}`;
        document.getElementById('customer-profile-content').innerHTML = `
        <dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
            <div><dt>Email</dt><dd>${escapeAdminHtml(customer.email)}</dd></div>
            <div><dt>Phone</dt><dd>${escapeAdminHtml(customer.phone)}</dd></div>
            <div><dt>Address</dt><dd>${escapeAdminHtml(customer.address || '')}</dd></div>
            <div><dt>Area / City</dt><dd>${escapeAdminHtml([customer.area, customer.city].filter(Boolean).join(', '))}</dd></div>
            <div><dt>Customer since</dt><dd>${escapeAdminHtml(customer.created_at)}</dd></div>
            <div><dt>VIP</dt><dd>${Number(customer.is_vip) === 1 ? 'Yes' : 'No'}</dd></div>
        </dl>
        <h4>Order history (${Array.isArray(customer.orders) ? customer.orders.length : 0})</h4>
        <div style="overflow-x:auto;"><table class="admin-table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>${(customer.orders || []).map(order => `
                <tr><td>${escapeAdminHtml(order.order_number)}</td><td>${escapeAdminHtml(order.created_at)}</td>
                    <td>${escapeAdminHtml(order.order_status)}</td><td>${formatBDT(order.total)}</td></tr>
            `).join('')}</tbody>
        </table></div>
    `;
        const dialog = document.getElementById('customer-profile-dialog');
        if (!dialog.open) dialog.showModal();
    } catch (error) {
        document.getElementById('customers-status').textContent =
            error.message || 'Customer profile could not be loaded.';
    }
}

function closeCustomerProfile() {
    const dialog = document.getElementById('customer-profile-dialog');
    if (dialog.open) dialog.close();
}

function exportCustomersCsv() {
    if (!hasAdminPermission('customers.read')) return;
    const customers = getFilteredCustomers();
    const csvCell = value => {
        let text = value === null || value === undefined ? '' : String(value);
        if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
        ['Name', 'Email', 'Phone', 'Address', 'Area', 'City', 'VIP', 'Total orders', 'Total spent (BDT)', 'Joined at'],
        ...customers.map(customer => [
            customer.name,
            customer.email,
            customer.phone,
            customer.address,
            customer.area,
            customer.city,
            Number(customer.is_vip) === 1 ? 'VIP' : 'Regular',
            Number(customer.total_orders) || 0,
            Number(customer.total_spent) || 0,
            customer.created_at
        ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customers-filtered.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    document.getElementById('customers-status').textContent =
        `Exported ${customers.length} filtered customer record${customers.length === 1 ? '' : 's'} as CSV.`;
}

async function toggleCustomerVip(button) {
    if (!hasAdminPermission('customers.update')) return;
    const customerId = Number(button.dataset.customerId);
    const isVip = button.dataset.isVip !== '1';
    if (!Number.isSafeInteger(customerId) || customerId < 1) return;
    try {
        const response = await adminFetch(`${API_BASE}/customers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: customerId, is_vip: isVip })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'VIP tag could not be updated.');
        }
        await loadCustomers();
    } catch (error) {
        window.alert(error.message || 'VIP tag could not be updated.');
    }
}

// 6. COUPONS
async function loadCoupons() {
    const res = await adminFetch(`${API_BASE}/coupons`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Could not load coupons.');
    }
    couponsById = new Map((json.data || []).map(coupon => [Number(coupon.id), coupon]));
    const coupons = json.data || [];
    renderAdminInsights('coupons', [
        { label: 'Coupons', value: coupons.length },
        { label: 'Active', value: coupons.filter(coupon => Number(coupon.is_active) === 1).length },
        { label: 'Redemptions', value: coupons.reduce((sum, coupon) => sum + (Number(coupon.times_used) || 0), 0) }
    ], [
        { label: 'Active', value: coupons.filter(coupon => Number(coupon.is_active) === 1).length },
        { label: 'Disabled', value: coupons.filter(coupon => Number(coupon.is_active) !== 1).length }
    ]);
    const couponsBySales = [...coupons].sort((a, b) => Number(b.paid_sales_amount || 0) - Number(a.paid_sales_amount || 0));
    const topCoupon = couponsBySales.find(coupon => Number(coupon.paid_sales_amount || 0) > 0);
    const performance = document.getElementById('coupon-sales-performance');
    performance.innerHTML = coupons.length
        ? `${coupons.every(coupon => Number(coupon.paid_order_count) === 0)
            ? '<p style="margin: 0; padding: 12px 16px; border: 1px solid #514b42; border-radius: 10px; color: #fbbf24;">No paid orders are linked to these coupons yet. Sales share appears after a coupon order is paid; historical redemptions without an order link cannot be attributed.</p>'
            : ''}${coupons.map(coupon => {
            const sales = Math.max(0, Number(coupon.paid_sales_amount) || 0);
            const share = Math.max(0, Math.min(100, Number(coupon.paid_sales_share_percent) || 0));
            const isTopSeller = topCoupon && Number(topCoupon.id) === Number(coupon.id);
            const paidOrders = Number(coupon.paid_order_count) || 0;
            return `
                <div style="background: #171613; border: 1px solid #514b42; border-radius: 10px; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 8px;">
                        <strong>${escapeAdminHtml(coupon.code)}${coupon.tag ? ` · ${escapeAdminHtml(coupon.tag)}` : ''}${isTopSeller ? ' <span style="color: #fbbf24;">Top seller</span>' : ''}</strong>
                        <span>${paidOrders ? `${formatBDT(sales)} · ${share.toFixed(2)}% of paid store sales` : 'No paid linked sales yet'}</span>
                    </div>
                    <div role="img" aria-label="${paidOrders ? `${escapeAdminHtml(coupon.code)} accounts for ${share.toFixed(2)} percent of paid store sales` : `${escapeAdminHtml(coupon.code)} has no paid attributed sales`}" style="height: 8px; overflow: hidden; border-radius: 999px; background: #514b42;">
                        <div style="width: ${share}%; height: 100%; background: #0891b2;"></div>
                    </div>
                </div>`;
        }).join('')}`
        : '<p style="color: #a8a29e;">No coupons to report yet.</p>';
    const tbody = document.querySelector('#coupons-table tbody');
    tbody.innerHTML = coupons.map(cp => {
        const share = Math.max(0, Math.min(100, Number(cp.paid_sales_share_percent) || 0));
        return `
        <tr>
            <td style="font-weight: 800; color: #dec28f;">${escapeAdminHtml(cp.code)}${cp.tag ? `<br><span style="display: inline-block; margin-top: 4px; padding: 2px 7px; border-radius: 999px; background: #514b42; color: #fff; font-size: 0.75rem;">${escapeAdminHtml(cp.tag)}</span>` : ''}</td>
            <td>${cp.type === 'percentage' ? `${Number(cp.value) || 0}%` : formatBDT(cp.value)}</td>
            <td>${formatBDT(cp.min_order)}</td>
            <td>${formatBDT(cp.paid_sales_amount)}</td>
            <td title="${Number(cp.paid_order_count) ? 'Share of all paid, non-cancelled store sales.' : 'No paid order is currently attributed to this coupon.'}">${Number(cp.paid_order_count) ? `${share.toFixed(2)}%` : '—'}</td>
            <td>${Number(cp.paid_order_count) || 0}</td>
            <td><span style="color: ${Number(cp.is_active) === 1 ? '#10b981' : '#ef4444'}; font-weight: 700;">● ${Number(cp.is_active) === 1 ? 'Active' : 'Disabled'}</span></td>
            <td style="white-space: nowrap;">
                ${hasAdminPermission('coupons.update') ? `<button type="button" class="admin-btn" style="padding: 4px 10px; font-size: 0.78rem;" data-csp-click="editCoupon" data-coupon-id="${Number(cp.id)}">Edit</button>` : ''}
                ${hasAdminPermission('coupons.archive') ? `<button type="button" style="border: none; background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;" data-csp-click="deleteCoupon" data-coupon-id="${Number(cp.id)}">Delete</button>` : ''}
            </td>
        </tr>
    `;
    }).join('');
}

function resetCouponForm() {
    document.getElementById('coupon-form').reset();
    document.getElementById('new-cp-id').value = '';
    document.getElementById('new-cp-active').checked = true;
    document.getElementById('coupon-form-title').textContent = '+ Create Coupon';
    document.getElementById('coupon-submit').textContent = 'Create Coupon';
    document.getElementById('coupon-cancel').style.display = 'none';
}

function editCoupon(id) {
    if (!hasAdminPermission('coupons.update')) return;
    const coupon = couponsById.get(Number(id));
    if (!coupon) {
        alert('Coupon details are not loaded. Refresh the coupon list and try again.');
        return;
    }
    document.getElementById('new-cp-id').value = String(coupon.id);
    document.getElementById('new-cp-code').value = coupon.code || '';
    document.getElementById('new-cp-tag').value = coupon.tag || '';
    document.getElementById('new-cp-val').value = coupon.value ?? '';
    document.getElementById('new-cp-type').value = coupon.type || 'percentage';
    document.getElementById('new-cp-min').value = coupon.min_order ?? 0;
    document.getElementById('new-cp-max').value = coupon.max_discount ?? '';
    document.getElementById('new-cp-expiry').value = coupon.expiry_date || '';
    document.getElementById('new-cp-limit').value = coupon.usage_limit ?? 0;
    document.getElementById('new-cp-active').checked = Number(coupon.is_active) === 1;
    document.getElementById('coupon-form-title').textContent = `Edit coupon ${coupon.code}`;
    document.getElementById('coupon-submit').textContent = 'Save Coupon Changes';
    document.getElementById('coupon-cancel').style.display = 'inline-block';
    document.getElementById('coupon-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleSaveCoupon(event) {
    event.preventDefault();
    const id = document.getElementById('new-cp-id').value;
    if (!hasAdminPermission(id ? 'coupons.update' : 'coupons.create')) return;
    const value = Number(document.getElementById('new-cp-val').value);
    const type = document.getElementById('new-cp-type').value;
    if (!document.getElementById('new-cp-code').value.trim() || !Number.isFinite(value) || value <= 0 || (type === 'percentage' && value > 100)) {
        alert('Enter a coupon code and a valid discount value.');
        return;
    }
    const payload = {
        ...(id ? { id: Number(id) } : {}),
        code: document.getElementById('new-cp-code').value.trim(),
        tag: document.getElementById('new-cp-tag').value.trim(),
        value,
        type,
        min_order: Number(document.getElementById('new-cp-min').value || 0),
        max_discount: document.getElementById('new-cp-max').value || null,
        expiry_date: document.getElementById('new-cp-expiry').value || null,
        usage_limit: Number(document.getElementById('new-cp-limit').value || 0),
        is_active: document.getElementById('new-cp-active').checked ? 1 : 0
    };
    const response = await adminFetch(`${API_BASE}/coupons`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not save the coupon.');
        return;
    }
    resetCouponForm();
    await loadCoupons();
}

async function deleteCoupon(id) {
    if (!hasAdminPermission('coupons.archive')) return;
    if (!confirm('Delete this coupon?')) return;
    const response = await adminFetch(`${API_BASE}/coupons?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not delete the coupon.');
        return;
    }
    await loadCoupons();
}

// 7. INVENTORY
async function loadInventory() {
    const res = await adminFetch(`${API_BASE}/inventory`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success' || !Array.isArray(json.data) || !json.summary) {
        throw new Error(json.error || 'Could not load inventory.');
    }
    const sum = json.summary;
    renderAdminInsights('inventory', [
        { label: 'Products tracked', value: Number(sum.total_products) || 0 },
        { label: 'Low stock', value: Number(sum.low_stock_count) || 0 },
        { label: 'Out of stock', value: Number(sum.out_of_stock_count) || 0 }
    ], [
        { label: 'Healthy', value: (Number(sum.total_products) || 0) - (Number(sum.low_stock_count) || 0) },
        { label: 'Low stock', value: Number(sum.low_stock_count) || 0 },
        { label: 'Out of stock', value: Number(sum.out_of_stock_count) || 0 }
    ]);

    document.getElementById('inv-summary-banner').innerHTML = `
        <div style="background: #171613; padding: 12px 20px; border-radius: 8px; border: 1px solid #514b42;">
            <strong>Total Products:</strong> ${Number(sum.total_products) || 0}
        </div>
        <div style="background: #171613; padding: 12px 20px; border-radius: 8px; border: 1px solid #514b42; color: #dec28f;">
            <strong>Low Stock (≤5):</strong> ${Number(sum.low_stock_count) || 0}
        </div>
        <div style="background: #171613; padding: 12px 20px; border-radius: 8px; border: 1px solid #514b42; color: #ef4444;">
            <strong>Out of Stock:</strong> ${Number(sum.out_of_stock_count) || 0}
        </div>
    `;

    const tbody = document.querySelector('#inventory-table tbody');
    tbody.innerHTML = (json.data || []).map(item => `
        <tr>
            <td style="font-weight: 700; color: #f7f4ee;">${escapeAdminHtml(item.name)}</td>
            <td style="color:#dec28f;">${escapeAdminHtml(item.category_name || 'Uncategorized')}</td>
            <td style="color: #b8b0a3;">${escapeAdminHtml(item.sku)}</td>
            <td style="font-size: 1.1rem; font-weight: 800; color: ${Number(item.stock_quantity) <= 5 ? '#ef4444' : '#10b981'};">${Number(item.stock_quantity) || 0}</td>
            <td><span style="font-size: 0.8rem; font-weight: 700;">${escapeAdminHtml(item.stock_status)}</span></td>
            <td>
                ${hasAdminPermission('inventory.adjust') ? `
                    <button data-csp-click="adjustInventory" data-product-id="${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}" data-quantity-delta="-1" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">-1</button>
                    <button data-csp-click="adjustInventory" data-product-id="${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}" data-quantity-delta="1" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">+1</button>
                    <button data-csp-click="adjustInventory" data-product-id="${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}" data-quantity-delta="10" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem; background: #dec28f; color: #000;">+10</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function toggleStockMovementHistory() {
    const panel = document.getElementById('inventory-movements-panel');
    const button = document.getElementById('inventory-movements-toggle');
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    button.textContent = panel.hidden ? 'Show stock movement history' : 'Hide stock movement history';
    if (panel.hidden) return;

    const status = document.getElementById('inventory-movements-status');
    status.textContent = 'Loading stock movements…';
    try {
        const response = await adminFetch(`${API_BASE}/inventory?type=movements`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Stock movement history could not be loaded.');
        }
        document.querySelector('#inventory-movements-table tbody').innerHTML = result.data.map(movement => `
            <tr>
                <td>${escapeAdminHtml(movement.created_at)}</td>
                <td>${escapeAdminHtml(movement.product_name || `Product ${movement.product_id}`)}</td>
                <td>${escapeAdminHtml(movement.type)}</td>
                <td>${Number(movement.quantity) > 0 ? '+' : ''}${Number(movement.quantity) || 0}</td>
                <td>${escapeAdminHtml(movement.reference_id ?? '')}</td>
                <td>${escapeAdminHtml(movement.notes || '')}</td>
            </tr>
        `).join('');
        status.textContent = `${result.data.length} recent stock movement(s).`;
    } catch (error) {
        status.textContent = error.message || 'Stock movement history could not be loaded.';
    }
}

async function adjustInventory(productId, delta) {
    if (!hasAdminPermission('inventory.adjust')) return;
    await adminFetch(`${API_BASE}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createIdempotencyKey() },
        body: JSON.stringify({ product_id: productId, action: 'adjust', delta })
    });
    loadInventory();
}

// 8. REPORTS
async function loadReports() {
    const fromInput = document.getElementById('reports-from');
    const toInput = document.getElementById('reports-to');
    const status = document.getElementById('reports-range-status');
    const exportButton = document.getElementById('reports-export');
    if (!fromInput || !toInput || !status || !exportButton) {
        throw new Error('The reports date controls are unavailable.');
    }

    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((value, part) => {
        if (part.type === 'year') value.year = part.value;
        if (part.type === 'month') value.month = part.value;
        if (part.type === 'day') value.day = part.value;
        return value;
    }, {});
    const todayValue = `${today.year}-${today.month}-${today.day}`;
    if (!fromInput.value || !toInput.value) {
        const fromDate = new Date(`${todayValue}T00:00:00Z`);
        fromDate.setUTCDate(fromDate.getUTCDate() - 29);
        fromInput.value = fromDate.toISOString().slice(0, 10);
        toInput.value = todayValue;
    }

    const from = fromInput.value;
    const to = toInput.value;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const validDate = value => {
        if (!datePattern.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!validDate(from) || !validDate(to) || from > to
        || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 3660) {
        lastReportsData = null;
        exportButton.disabled = true;
        status.textContent = 'Enter valid dates in order; the range may not exceed ten years.';
        status.setAttribute('role', 'alert');
        return;
    }

    status.textContent = 'Loading report for the selected Dhaka dates…';
    status.setAttribute('role', 'status');
    lastReportsData = null;
    exportButton.disabled = true;
    document.getElementById('insights-reports')?.replaceChildren();
    document.getElementById('reports-breakdown-box').replaceChildren();
    const params = new URLSearchParams({ from, to });
    let d;
    try {
        const res = await adminFetch(`${API_BASE}/reports?${params}`);
        const json = await res.json();
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Could not load reports.');
        d = json.data;
    } catch (error) {
        status.textContent = error.message || 'Could not load reports.';
        status.setAttribute('role', 'alert');
        throw error;
    }
    lastReportsData = d;
    exportButton.disabled = false;
    status.textContent = `Showing ${from} through ${to} (Asia/Dhaka). Export includes summary metrics and breakdowns only.`;
    const overview = d.overview || {};
    renderAdminInsights('reports', [
        { label: 'Paid revenue', value: formatBDT(overview.paid_order_revenue) },
        { label: 'Orders', value: Number(overview.total_orders) || 0 },
        { label: 'Average order', value: formatBDT(overview.average_paid_order_value) },
        { label: 'Discounts', value: formatBDT(overview.total_discounts) }
    ], (d.status_breakdown || []).map(status => ({ label: status.order_status, value: Number(status.count) || 0 })));

    document.getElementById('reports-breakdown-box').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <h4 style="color: #dc2626; margin-bottom: 12px;">Orders By Status</h4>
                ${d.status_breakdown.map(s => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>${escapeAdminHtml(s.order_status)}:</span>
                        <strong>${Number(s.count) || 0} orders (${formatBDT(s.order_value)})</strong>
                    </div>
                `).join('')}
            </div>

            <div style="background: #171613; padding: 20px; border-radius: 12px; border: 1px solid #514b42;">
                <h4 style="color: #dec28f; margin-bottom: 12px;">Top Performing Products</h4>
                ${d.top_products.map(p => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>${escapeAdminHtml(p.product_name)}:</span>
                        <strong>${Number(p.total_units_sold) || 0} sold</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function exportReportsCsv() {
    if (!lastReportsData) return;
    const { overview = {}, status_breakdown = [], top_products = [] } = lastReportsData;
    const csvCell = value => {
        let text = value === null || value === undefined ? '' : String(value);
        if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
        ['Report', 'Value'],
        ['Date from (Asia/Dhaka)', overview.range?.from || 'All dates'],
        ['Date to (Asia/Dhaka)', overview.range?.to || 'All dates'],
        ['Paid revenue', Number(overview.paid_order_revenue) || 0],
        ['Orders', Number(overview.total_orders) || 0],
        ['Average paid order value', Number(overview.average_paid_order_value) || 0],
        ['Discounts', Number(overview.total_discounts) || 0],
        ['Recorded income', Number(overview.recorded_income) || 0],
        ['Recorded expenses', Number(overview.recorded_expenses) || 0],
        [],
        ['Orders by status', 'Order count', 'Order value'],
        ...status_breakdown.map(item => [
            item.order_status || '',
            Number(item.count) || 0,
            Number(item.order_value) || 0
        ]),
        [],
        ['Top products', 'Units sold', 'Order value'],
        ...top_products.map(item => [
            item.product_name || '',
            Number(item.total_units_sold) || 0,
            Number(item.total_order_value) || 0
        ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const range = overview.range;
    link.href = url;
    link.download = range
        ? `sales-report-${range.from}-to-${range.to}.csv`
        : 'sales-report-all-dates.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// 9. SETTINGS
function applyAdminStoreName(value) {
    const storeName = typeof value === 'string' && value.trim()
        ? value.trim()
        : 'Shopademia';
    document.getElementById('set_store_name').value = storeName;
    document.title = `Admin Panel | ${storeName}`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.content = `${storeName} administration panel.`;
}

async function loadSettings() {
    const res = await adminFetch(`${API_BASE}/settings`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Could not load store settings.');
    }
    const s = json.data || {};

    applyAdminStoreName(s.store_name);
    document.getElementById('set_announcement_text').value = s.announcement_text || 'Delivery availability and estimates are shown at checkout.';
    document.getElementById('set_fee_dhaka').value = s.delivery_fee_dhaka || '80';
    document.getElementById('set_fee_outside_dhaka').value = s.delivery_fee_outside_dhaka || '130';
    document.getElementById('set_bkash').value = s.bkash_number || '';
    document.getElementById('set_nagad').value = s.nagad_number || '';
    document.getElementById('set_rocket').value = s.rocket_number || '';
    document.getElementById('set_social_heading').value = s.social_heading || 'Follow us';
    document.getElementById('set_social_instagram_label').value = s.social_instagram_label || 'Instagram · ShopademiaBD';
    document.getElementById('set_social_instagram_url').value = s.social_instagram_url || 'https://www.instagram.com/ShopademiaBD';
    document.getElementById('set_social_x_label').value = s.social_x_label || 'X · SHOPADEMIA';
    document.getElementById('set_social_x_url').value = s.social_x_url || 'https://x.com/SHOPADEMIA';
    document.getElementById('set_social_facebook_label').value = s.social_facebook_label || 'Facebook · SHOPADEMIA';
    document.getElementById('set_social_facebook_url').value = s.social_facebook_url || 'https://www.facebook.com/SHOPADEMIA';
    document.getElementById('set_promo_eyebrow').value = s.homepage_promo_eyebrow || 'Explore the collection';
    document.getElementById('set_promo_title').value = s.homepage_promo_title || 'Discover Our Latest Collection';
    document.getElementById('set_promo_description').value = s.homepage_promo_description || 'Explore quality products selected for everyday living.';
    document.getElementById('set_promo_button_text').value = s.homepage_promo_button_text || 'Shop Collection →';
    document.getElementById('set_promo_link').value = s.homepage_promo_link || 'https://shopademia.store/shop.html';
    currentPromoImage = s.homepage_promo_image || '';
    document.getElementById('set_promo_image_current').textContent = currentPromoImage
        ? `Current image: ${currentPromoImage}` : 'No banner image selected; the banner uses its text-only style.';
    if (adminPermissions?.includes('*.*')) {
        await Promise.all([
            loadHomepageCatalogs().catch(error => {
                console.error('Hero slide catalogs could not be loaded.', error);
                document.getElementById('hero-slides-status').textContent =
                    error.message || 'Products and categories could not be loaded for slide editing.';
            }),
            loadHeroSlides().catch(error => {
                console.error('Hero slides could not be loaded.', error);
                document.getElementById('hero-slides-status').textContent =
                    error.message || 'Hero slides could not be loaded.';
            }),
            loadConsentLogs(),
            loadStaffManagement(),
            loadTrackingSettings().catch(error => {
                document.getElementById('tracking-manager-status').textContent =
                    error.message || 'Tracking settings could not be loaded.';
            })
        ]);
        loadPrimaryNavigation(s.primary_nav_links);
        renderHeroSlidesEditor();
    }
}

async function loadTrackingSettings() {
    const response = await adminFetch(`${API_BASE}/tracking-settings`);
    const result = await response.json();
    if (!response.ok || result.status !== 'success' || !result.data) {
        throw new Error(result.error || 'Could not load tracking settings.');
    }
    trackingSlots = result.data;
    renderTrackingSlots();
}

function renderTrackingSlots() {
    const container = document.getElementById('tracking-slots-grid');
    if (!container) return;
    container.replaceChildren();

    for (const slotKey of TRACKING_SLOT_KEYS) {
        const slot = trackingSlots[slotKey];
        if (!slot) continue;
        const card = document.createElement('article');
        card.style.cssText = 'min-width:0;padding:16px;border:1px solid #514b42;border-radius:10px;background:#201e1a;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
        const title = document.createElement('h4');
        title.style.cssText = 'margin:0;color:#dec28f;';
        title.textContent = slot.label;
        const badge = document.createElement('span');
        const warningList = Array.isArray(slot.warnings) ? slot.warnings : [];
        const state = warningList.length ? 'Warning'
            : (slot.enabled ? 'Active' : (slot.value ? 'Disabled' : 'Empty'));
        badge.textContent = state;
        badge.setAttribute('role', 'status');
        badge.style.cssText = 'padding:3px 8px;border-radius:999px;background:' +
            (state === 'Active' ? '#1d4730' : state === 'Warning' ? '#5b4520' : '#514b42') +
            ';color:#fff;font-size:.75rem;white-space:nowrap;';
        titleRow.append(title, badge);
        card.append(titleRow);

        const fieldId = `tracking-value-${slotKey}`;
        const helpId = `tracking-help-${slotKey}`;
        const warningId = `tracking-warning-${slotKey}`;
        const label = document.createElement('label');
        label.htmlFor = fieldId;
        label.textContent = 'Snippet';
        label.style.cssText = 'display:block;margin-top:12px;color:#d6cec1;';
        const help = document.createElement('small');
        help.id = helpId;
        help.style.cssText = 'display:block;margin:4px 0 8px;color:#b8b0a3;';
        help.textContent = TRACKING_SLOT_HELP[slotKey];
        const textarea = document.createElement('textarea');
        textarea.id = fieldId;
        textarea.className = 'admin-input';
        textarea.rows = 7;
        textarea.spellcheck = false;
        textarea.style.cssText = 'width:100%;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;';
        textarea.setAttribute('aria-describedby', `${helpId} ${warningId}`);
        textarea.value = slot.value || '';
        card.append(label, help, textarea);

        const enabledLabel = document.createElement('label');
        enabledLabel.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;';
        const enabled = document.createElement('input');
        enabled.id = `tracking-enabled-${slotKey}`;
        enabled.type = 'checkbox';
        enabled.checked = Boolean(slot.enabled);
        const enabledText = document.createElement('span');
        enabledText.textContent = 'Enabled';
        enabledLabel.append(enabled, enabledText);
        card.append(enabledLabel);

        const iframeLabel = document.createElement('label');
        iframeLabel.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-top:8px;';
        const iframeConfirmation = document.createElement('input');
        iframeConfirmation.id = `tracking-iframe-confirm-${slotKey}`;
        iframeConfirmation.type = 'checkbox';
        iframeConfirmation.style.marginTop = '3px';
        const iframeText = document.createElement('span');
        iframeText.textContent = 'I reviewed and approve any iframe in this snippet.';
        iframeLabel.append(iframeConfirmation, iframeText);
        card.append(iframeLabel);

        const warning = document.createElement('p');
        warning.id = warningId;
        warning.setAttribute('role', 'status');
        warning.setAttribute('aria-live', 'polite');
        warning.style.cssText = 'min-height:1.3em;margin:8px 0;color:#f0c674;overflow-wrap:anywhere;';
        warning.textContent = warningList.join(' ');
        card.append(warning);

        const updated = document.createElement('p');
        updated.style.cssText = 'margin:8px 0;color:#b8b0a3;font-size:.82rem;';
        updated.textContent = slot.updated_at
            ? `Last updated by ${slot.updated_by || 'an admin'} at ${slot.updated_at}.`
            : 'No saved changes yet.';
        card.append(updated);

        const verification = document.createElement('p');
        verification.id = `tracking-verification-${slotKey}`;
        verification.setAttribute('role', 'status');
        verification.style.cssText = 'margin:8px 0;color:#b8b0a3;font-size:.82rem;';
        verification.textContent = slot.verification || (slot.enabled ? 'Not verified yet.' : 'Verification skipped while disabled.');
        card.append(verification);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
        for (const [labelText, actionName] of [
            ['Save', 'saveTrackingSlot'],
            ['Disable', 'disableTrackingSlot'],
            ['Audit history', 'loadTrackingAudit']
        ]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-btn';
            button.dataset.cspClick = actionName;
            button.dataset.trackingSlot = slotKey;
            button.textContent = labelText;
            actions.append(button);
        }
        card.append(actions);
        container.append(card);
    }
}

function trackingTotpCode() {
    const code = window.prompt('Enter a current, unused 6-digit authenticator code to re-verify this change.');
    if (code === null) return null;
    if (!/^[0-9]{6}$/.test(code.trim())) {
        throw new Error('Enter a 6-digit authenticator code.');
    }
    return code.trim();
}

async function saveTrackingSlot(element, forceDisabled = false) {
    if (!adminPermissions?.includes('*.*')) {
        document.getElementById('tracking-manager-status').textContent =
            'Only a Super Admin can manage tracking snippets.';
        return;
    }
    const slotKey = element.dataset.trackingSlot;
    if (!TRACKING_SLOT_KEYS.includes(slotKey)) return;
    const status = document.getElementById('tracking-manager-status');
    const saveButtons = document.querySelectorAll(`[data-tracking-slot="${slotKey}"]`);
    for (const button of saveButtons) button.disabled = true;
    try {
        const code = trackingTotpCode();
        if (code === null) return;
        const response = await adminFetch(`${API_BASE}/tracking-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot_key: slotKey,
                value: document.getElementById(`tracking-value-${slotKey}`).value,
                enabled: forceDisabled ? false : document.getElementById(`tracking-enabled-${slotKey}`).checked,
                confirm_iframe: document.getElementById(`tracking-iframe-confirm-${slotKey}`).checked,
                totp_code: code
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save this tracking slot.');
        }
        if (result.data) {
            trackingSlots[slotKey] = {
                ...trackingSlots[slotKey],
                value: result.data.value,
                enabled: result.data.enabled,
                warnings: result.data.warnings || []
            };
        }
        status.textContent = result.message || 'Tracking slot saved.';
        await loadTrackingSettings();
    } catch (error) {
        status.textContent = error.message || 'Could not save this tracking slot.';
    } finally {
        for (const button of saveButtons) button.disabled = false;
    }
}

async function loadTrackingAudit(element) {
    const slotKey = element.dataset.trackingSlot;
    if (!TRACKING_SLOT_KEYS.includes(slotKey)) return;
    const panel = document.getElementById('tracking-audit-panel');
    const title = document.getElementById('tracking-audit-title');
    const rows = document.getElementById('tracking-audit-rows');
    title.textContent = `${trackingSlots[slotKey]?.label || slotKey} audit history`;
    rows.replaceChildren();
    panel.hidden = false;
    try {
        const response = await adminFetch(
            `${API_BASE}/tracking-settings?action=history&slot_key=${encodeURIComponent(slotKey)}`
        );
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not load tracking audit history.');
        }
        if (!result.data.length) {
            rows.textContent = 'No audit entries for this slot.';
            return;
        }
        const list = document.createElement('ul');
        list.style.paddingLeft = '22px';
        for (const entry of result.data) {
            const item = document.createElement('li');
            const oldHash = entry.old_value_hash ? String(entry.old_value_hash).slice(0, 12) : 'none';
            const newHash = entry.new_value_hash ? String(entry.new_value_hash).slice(0, 12) : 'none';
            item.textContent = `${entry.created_at} — ${entry.actor} (${entry.ip_address}); ` +
                `SHA-256 ${oldHash} → ${newHash}; ${entry.enabled ? 'enabled' : 'disabled'}`;
            list.append(item);
        }
        rows.append(list);
    } catch (error) {
        rows.textContent = error.message || 'Could not load tracking audit history.';
    }
}

async function verifyTrackingInstallation() {
    const status = document.getElementById('tracking-manager-status');
    status.textContent = 'Checking the latest server-rendered storefront home page…';
    try {
        const response = await adminFetch(`${API_BASE}/tracking-settings?action=verify`);
        const verificationResponse = await response.json();
        if (!response.ok || verificationResponse.status !== 'success' || !verificationResponse.data?.slots) {
            throw new Error(verificationResponse.error || 'Could not verify the storefront installation.');
        }
        let enabledCount = 0;
        for (const slotKey of TRACKING_SLOT_KEYS) {
            const slot = trackingSlots[slotKey];
            const verification = document.getElementById(`tracking-verification-${slotKey}`);
            if (!slot?.enabled || !slot.value) {
                if (verification) verification.textContent = 'Verification skipped while disabled.';
                continue;
            }
            enabledCount++;
            const state = verificationResponse.data.slots[slotKey];
            slot.verification = state === 'present'
                ? 'Present in latest server-rendered home page.'
                : state === 'missing'
                    ? 'Missing from latest server-rendered home page.'
                    : 'Error checking this tracking slot.';
            if (verification) verification.textContent = slot.verification;
        }
        status.textContent = enabledCount
            ? `Installation check completed against ${verificationResponse.data.url} at ${verificationResponse.data.checked_at}.`
            : 'No enabled snippets to verify.';
    } catch (error) {
        for (const slotKey of TRACKING_SLOT_KEYS) {
            const slot = trackingSlots[slotKey];
            if (!slot?.enabled) continue;
            const result = document.getElementById(`tracking-verification-${slotKey}`);
            if (result) result.textContent = `Error checking storefront HTML: ${error.message || 'request failed'}`;
        }
        status.textContent = error.message || 'Could not verify the storefront installation.';
    }
}

async function previewTrackingInstallation() {
    const status = document.getElementById('tracking-manager-status');
    status.textContent = 'Rendering the storefront home page with unsaved snippets…';
    try {
        const slots = {};
        for (const slotKey of TRACKING_SLOT_KEYS) {
            slots[slotKey] = {
                value: document.getElementById(`tracking-value-${slotKey}`).value,
                enabled: document.getElementById(`tracking-enabled-${slotKey}`).checked,
                confirm_iframe: document.getElementById(`tracking-iframe-confirm-${slotKey}`).checked
            };
        }
        const response = await adminFetch(`${API_BASE}/tracking-settings?action=preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slots })
        });
        const html = await response.text();
        if (!response.ok) {
            let result = {};
            let responseMessage = html;
            try {
                result = JSON.parse(html);
                responseMessage = result.error || responseMessage;
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
            }
            throw new Error(responseMessage || 'Could not render the tracking preview.');
        }
        document.getElementById('tracking-preview-panel').hidden = false;
        document.getElementById('tracking-preview-frame').srcdoc = html;
        status.textContent = 'Preview rendered in an isolated frame; scripts are not executed.';
    } catch (error) {
        status.textContent = error.message || 'Could not render the tracking preview.';
    }
}

async function purgeTrackingCache() {
    const status = document.getElementById('tracking-manager-status');
    try {
        const code = trackingTotpCode();
        if (code === null) return;
        const response = await adminFetch(`${API_BASE}/tracking-settings?action=purge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ totp_code: code })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not record the storefront cache purge request.');
        }
        status.textContent = result.message;
    } catch (error) {
        status.textContent = error.message || 'Could not record the storefront cache purge request.';
    }
}

function defaultHeroSlide() {
    return {
        image_desktop: '',
        image_mobile: '',
        link_type: 'page',
        link_value: 'shop',
        alt_text: '',
        starts_at: '',
        ends_at: '',
        is_enabled: true
    };
}

async function loadHomepageCatalogs() {
    const [productsResponse, categoriesResponse] = await Promise.all([
        adminFetch(`${API_BASE}/products?include_unavailable=1`),
        adminFetch(`${API_BASE}/categories`)
    ]);
    const [productsResult, categoriesResult] = await Promise.all([
        productsResponse.json(),
        categoriesResponse.json()
    ]);
    if (!productsResponse.ok || !Array.isArray(productsResult.data)) {
        throw new Error(productsResult.error || 'Could not load products for homepage slides.');
    }
    if (!categoriesResponse.ok || !Array.isArray(categoriesResult.data)) {
        throw new Error(categoriesResult.error || 'Could not load categories for homepage slides.');
    }
    homepageProducts = productsResult.data;
    homepageCategories = categoriesResult.data;
}

async function loadHeroSlides() {
    const response = await adminFetch(`${API_BASE}/hero-slides.php`);
    const result = await response.json();
    if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Could not load hero slides.');
    }
    heroSlides = result.data;
    if (heroSlides.length === 0) heroSlides = [defaultHeroSlide()];
    renderHeroSlidesEditor();
}

function readHeroSlidesFromEditor() {
    const cards = [...document.querySelectorAll('[data-hero-slide-index]')];
    return cards.map(card => {
        const getValue = name => card.querySelector(`[data-hero-field="${name}"]`).value.trim();
        const previousSlide = heroSlides[Number(card.dataset.heroSlideIndex)] || {};
        return {
            id: card.dataset.slideId ? Number(card.dataset.slideId) : undefined,
            image_desktop: card.dataset.desktopImage || '',
            image_mobile: card.dataset.mobileImage || null,
            desktop_file: card.querySelector('[data-hero-field="desktop_file"]').files[0]
                || previousSlide.desktop_file || null,
            mobile_file: card.querySelector('[data-hero-field="mobile_file"]').files[0]
                || previousSlide.mobile_file || null,
            remove_mobile: card.querySelector('[data-hero-field="remove_mobile"]').checked,
            link_type: getValue('link_type'),
            link_value: getValue(getValue('link_type') === 'url' ? 'custom_url' : 'link_value'),
            alt_text: getValue('alt_text'),
            starts_at: getValue('starts_at') || null,
            ends_at: getValue('ends_at') || null,
            is_enabled: card.querySelector('[data-hero-field="enabled"]').checked
        };
    });
}

function heroSlideDestinationOptions(slide) {
    if (slide.link_type === 'product') {
        return homepageProducts.map(product => `<option value="${Number(product.id)}" ${String(product.id) === slide.link_value ? 'selected' : ''}>${escapeAdminHtml(product.name)}</option>`).join('');
    }
    if (slide.link_type === 'category') {
        return homepageCategories.map(category => `<option value="${Number(category.id)}" ${String(category.id) === slide.link_value ? 'selected' : ''}>${escapeAdminHtml(category.name)}</option>`).join('');
    }
    if (slide.link_type === 'page') {
        return ADMIN_NAVIGATION_PAGES.map(page => `<option value="${page.id}" ${page.id === slide.link_value ? 'selected' : ''}>${escapeAdminHtml(page.label)}</option>`).join('');
    }
    return '';
}

function renderHeroSlidesEditor() {
    const editor = document.getElementById('hero-slides-editor');
    editor.innerHTML = heroSlides.map((slide, index) => {
        const destinationOptions = heroSlideDestinationOptions(slide);
        const linkType = ['product', 'category', 'page', 'url'].includes(slide.link_type) ? slide.link_type : 'page';
        const imagePath = slide.desktop_file
            ? `<span>Selected: ${escapeAdminHtml(slide.desktop_file.name)}</span>`
            : slide.image_desktop
                ? `<span>${escapeAdminHtml(slide.image_desktop)}</span>`
                : '<span>No desktop image uploaded</span>';
        const mobileImagePath = slide.mobile_file
            ? `Selected: ${escapeAdminHtml(slide.mobile_file.name)}`
            : slide.image_mobile
                ? escapeAdminHtml(slide.image_mobile)
                : 'Uses the desktop image when empty.';
        return `
          <article data-hero-slide-index="${index}" data-slide-id="${slide.id || ''}" data-desktop-image="${escapeAdminHtml(slide.image_desktop || '')}" data-mobile-image="${escapeAdminHtml(slide.image_mobile || '')}" style="margin-top: 14px; padding: 18px; border: 1px solid #514b42; border-radius: 12px; background: #211f1b;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;">
              <strong>Slide ${index + 1}</strong>
              <div style="display:flex;gap:6px;">
                <button type="button" class="admin-btn" aria-label="Move slide ${index + 1} up" data-csp-click="moveHeroSlide" data-slide-index="${index}" data-slide-direction="-1" ${index === 0 ? 'disabled' : ''}>Up</button>
                <button type="button" class="admin-btn" aria-label="Move slide ${index + 1} down" data-csp-click="moveHeroSlide" data-slide-index="${index}" data-slide-direction="1" ${index === heroSlides.length - 1 ? 'disabled' : ''}>Down</button>
                <button type="button" class="admin-btn" style="background:#514b42;color:#fff;" data-csp-click="removeHeroSlide" data-slide-index="${index}">Remove</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
              <label style="grid-column:1/-1;">Desktop banner image *
                <input class="admin-input" type="file" accept="image/jpeg,image/png,image/webp" data-hero-field="desktop_file" ${slide.image_desktop || slide.desktop_file ? '' : 'required'}>
                <small>${imagePath}</small>
              </label>
              <label style="grid-column:1/-1;">Mobile banner image (optional)
                <input class="admin-input" type="file" accept="image/jpeg,image/png,image/webp" data-hero-field="mobile_file">
                <small>${mobileImagePath}</small>
                <span style="display:block;"><input type="checkbox" data-hero-field="remove_mobile" ${slide.remove_mobile ? 'checked' : ''} ${slide.image_mobile ? '' : 'disabled'}> Remove existing mobile image</span>
              </label>
              <label>Destination type
                <select class="admin-input" data-hero-field="link_type">
                  <option value="product" ${linkType === 'product' ? 'selected' : ''}>Product</option>
                  <option value="category" ${linkType === 'category' ? 'selected' : ''}>Category / collection</option>
                  <option value="page" ${linkType === 'page' ? 'selected' : ''}>Store page</option>
                  <option value="url" ${linkType === 'url' ? 'selected' : ''}>Custom URL</option>
                </select>
              </label>
              <label data-hero-destination-field ${linkType === 'url' ? 'hidden' : ''}>Select destination
                <select class="admin-input" data-hero-field="link_value" ${linkType === 'url' ? 'disabled' : 'required'}>${destinationOptions}</select>
              </label>
              <label data-hero-url-field ${linkType === 'url' ? '' : 'hidden'}>Custom URL
                <input class="admin-input" data-hero-field="custom_url" maxlength="1000" value="${linkType === 'url' ? escapeAdminHtml(slide.link_value || '') : ''}" placeholder="https://example.com/campaign" ${linkType === 'url' ? 'required' : 'disabled'}>
              </label>
              <label>Alt text (optional)
                <input class="admin-input" data-hero-field="alt_text" maxlength="200" value="${escapeAdminHtml(slide.alt_text || '')}">
              </label>
              <label>Start date/time (UTC, optional)
                <input class="admin-input" type="datetime-local" data-hero-field="starts_at" value="${escapeAdminHtml((slide.starts_at || '').replace(' ', 'T').slice(0, 16))}">
              </label>
              <label>End date/time (UTC, optional)
                <input class="admin-input" type="datetime-local" data-hero-field="ends_at" value="${escapeAdminHtml((slide.ends_at || '').replace(' ', 'T').slice(0, 16))}">
              </label>
              <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" data-hero-field="enabled" ${slide.is_enabled === false || Number(slide.is_enabled) === 0 ? '' : 'checked'}> Enabled</label>
            </div>
          </article>`;
    }).join('');
}

function loadPrimaryNavigation(value) {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            console.error('Primary navigation setting could not be parsed.', error);
            parsed = [];
        }
    }
    const allowed = [
        ...ADMIN_NAVIGATION_PAGES.map(page => page.id),
        ...homepageCategories.map(category => `category:${category.slug}`)
    ];
    primaryNavLinks = Array.isArray(parsed) ? parsed.filter(id => allowed.includes(id)).slice(0, 5) : [];
    if (primaryNavLinks.length === 0) primaryNavLinks = ['home', 'shop', 'contact'];
    renderPrimaryNavigationEditor();
}

function renderPrimaryNavigationEditor() {
    const list = document.getElementById('primary-nav-items');
    const add = document.getElementById('primary-nav-add');
    if (!list || !add) return;
    const options = [
        ...ADMIN_NAVIGATION_PAGES,
        ...homepageCategories.map(category => ({ id: `category:${category.slug}`, label: category.name }))
    ];
    const current = new Map(options.map(option => [option.id, option.label]));
    list.innerHTML = primaryNavLinks.map((id, index) => `
      <li style="margin:8px 0;">
        <span>${escapeAdminHtml(current.get(id) || id)}</span>
        <button type="button" class="admin-btn" aria-label="Move ${escapeAdminHtml(current.get(id) || id)} up" data-csp-click="movePrimaryNavLink" data-link-index="${index}" data-link-direction="-1" ${index === 0 ? 'disabled' : ''}>Up</button>
        <button type="button" class="admin-btn" aria-label="Move ${escapeAdminHtml(current.get(id) || id)} down" data-csp-click="movePrimaryNavLink" data-link-index="${index}" data-link-direction="1" ${index === primaryNavLinks.length - 1 ? 'disabled' : ''}>Down</button>
        <button type="button" class="admin-btn" data-csp-click="removePrimaryNavLink" data-link-index="${index}">Remove</button>
      </li>
    `).join('');
    const available = options.filter(option => !primaryNavLinks.includes(option.id));
    add.innerHTML = available.map(option => `<option value="${escapeAdminHtml(option.id)}">${escapeAdminHtml(option.label)}</option>`).join('');
    add.disabled = primaryNavLinks.length >= 5 || available.length === 0;
}

function addPrimaryNavLink() {
    const add = document.getElementById('primary-nav-add');
    const status = document.getElementById('primary-nav-status');
    if (primaryNavLinks.length >= 5 || !add.value || primaryNavLinks.includes(add.value)) return;
    primaryNavLinks.push(add.value);
    renderPrimaryNavigationEditor();
    status.textContent = '';
}

function movePrimaryNavLink(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= primaryNavLinks.length) return;
    [primaryNavLinks[index], primaryNavLinks[next]] = [primaryNavLinks[next], primaryNavLinks[index]];
    renderPrimaryNavigationEditor();
}

function removePrimaryNavLink(index) {
    primaryNavLinks.splice(index, 1);
    renderPrimaryNavigationEditor();
}

async function savePrimaryNavLinks() {
    const status = document.getElementById('primary-nav-status');
    if (!adminPermissions?.includes('*.*')) return;
    status.textContent = 'Saving navigation…';
    try {
        const response = await adminFetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ primary_nav_links: primaryNavLinks })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save primary navigation.');
        }
        status.textContent = 'Navigation saved.';
    } catch (error) {
        status.textContent = error.message || 'Could not save primary navigation.';
    }
}

function addHomepageSlide() {
    heroSlides = readHeroSlidesFromEditor();
    const status = document.getElementById('hero-slides-status');
    if (heroSlides.length >= 100) {
        status.textContent = 'A hero slide set can contain at most 100 slides.';
        return;
    }
    heroSlides.push(defaultHeroSlide());
    renderHeroSlidesEditor();
    status.textContent = '';
}

function removeHomepageSlide(index) {
    heroSlides = readHeroSlidesFromEditor();
    if (heroSlides.length <= 1) {
        document.getElementById('hero-slides-status').textContent = 'Keep at least one hero slide.';
        return;
    }
    heroSlides.splice(index, 1);
    renderHeroSlidesEditor();
    document.getElementById('hero-slides-status').textContent = '';
}

function moveHomepageSlide(index, direction) {
    heroSlides = readHeroSlidesFromEditor();
    const next = index + direction;
    if (next < 0 || next >= heroSlides.length) return;
    [heroSlides[index], heroSlides[next]] = [heroSlides[next], heroSlides[index]];
    renderHeroSlidesEditor();
}

async function uploadHeroImage(file, slot) {
    if (!file) return '';
    if (file.size > 3000000) throw new Error('Each selected hero image must be smaller than 3 MB.');
    const image = await createImageBitmap(file);
    const width = slot === 'mobile' ? 900 : 1920;
    const height = slot === 'mobile' ? 600 : 680;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        image.close();
        throw new Error('Hero image processing is unavailable in this browser.');
    }
    const scale = Math.max(width / image.width, height / image.height);
    const cropWidth = width / scale;
    const cropHeight = height / scale;
    context.drawImage(
        image,
        (image.width - cropWidth) / 2,
        (image.height - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height
    );
    image.close();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 4200000) throw new Error('The processed hero image is too large to upload.');
    const response = await adminFetch(`${API_BASE}/hero-slide-images.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_url: dataUrl, slot })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success' || typeof result.data?.path !== 'string') {
        throw new Error(result.error || 'Could not upload the hero image.');
    }
    return result.data.path;
}

async function saveHomepageSlides() {
    const status = document.getElementById('hero-slides-status');
    if (!adminPermissions?.includes('*.*')) return;
    const slides = readHeroSlidesFromEditor();
    for (const [index, slide] of slides.entries()) {
        if (!slide.image_desktop && !slide.desktop_file) {
            status.textContent = `Choose a desktop image for slide ${index + 1}.`;
            return;
        }
        if (!['product', 'category', 'page', 'url'].includes(slide.link_type)
            || (slide.link_type === 'url' && !isSafeHomepageUrl(slide.link_value || ''))
            || (slide.link_type !== 'url' && !slide.link_value)
            || (slide.starts_at && slide.ends_at && slide.starts_at >= slide.ends_at)) {
            status.textContent = `Check the destination and schedule for slide ${index + 1}.`;
            return;
        }
    }
    status.textContent = 'Uploading images and saving slides…';
    try {
        for (const slide of slides) {
            if (slide.desktop_file) slide.image_desktop = await uploadHeroImage(slide.desktop_file, 'desktop');
            if (slide.mobile_file) slide.image_mobile = await uploadHeroImage(slide.mobile_file, 'mobile');
            else if (slide.remove_mobile) slide.image_mobile = null;
            delete slide.desktop_file;
            delete slide.mobile_file;
            delete slide.remove_mobile;
        }
        const response = await adminFetch(`${API_BASE}/hero-slides.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slides })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save hero slides.');
        }
        await loadHeroSlides();
        status.textContent = 'Hero slides saved.';
    } catch (error) {
        status.textContent = error.message || 'Could not save hero slides.';
    }
}

async function loadConsentLogs() {
    const status = document.getElementById('consent-log-status');
    const body = document.querySelector('#consent-log-table tbody');
    if (!adminPermissions?.includes('*.*')) return;
    status.textContent = 'Loading consent log…';
    try {
        const response = await adminFetch(`${API_BASE}/consent`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Could not load the consent log.');
        }
        consentReceipts = result.data;
        renderConsentLogRows();
    } catch (error) {
        status.textContent = error.message || 'Could not load the consent log.';
    }
}

function renderConsentLogRows() {
    const status = document.getElementById('consent-log-status');
    const body = document.querySelector('#consent-log-table tbody');
    const choiceFilter = document.getElementById('consent-log-choice')?.value || '';
    const search = (document.getElementById('consent-log-search')?.value || '').trim().toLowerCase();
    const filtered = consentReceipts.filter(receipt =>
        (!choiceFilter || receipt.choice === choiceFilter)
        && (!search || String(receipt.policy_version || '').toLowerCase().includes(search)
            || String(receipt.banner_version || '').toLowerCase().includes(search))
    );
    body.innerHTML = filtered.map(receipt => {
            const categories = receipt.categories || {};
            const date = new Date(receipt.created_at);
            const formattedDate = Number.isNaN(date.getTime()) ? receipt.created_at : date.toLocaleString();
            return `<tr>
              <td>${escapeAdminHtml(formattedDate)}</td>
              <td>${escapeAdminHtml(receipt.choice)}</td>
              <td>${escapeAdminHtml(receipt.page_path || 'Unknown')}<br><span style="color:#b8b0a3;">${escapeAdminHtml(receipt.locale || 'Unknown')}</span></td>
              <td>${escapeAdminHtml(receipt.timezone || 'Unknown')}</td>
              <td>${escapeAdminHtml(receipt.device_type || 'Unknown')} / ${escapeAdminHtml(receipt.browser_name || 'Unknown')}</td>
              <td>${categories.analytics === true ? 'Yes' : 'No'}</td>
              <td>${categories.marketing === true ? 'Yes' : 'No'}</td>
              <td>${categories.sessionReplay === true ? 'Yes' : 'No'}</td>
              <td>${escapeAdminHtml(receipt.policy_version)}</td>
            </tr>`;
        }).join('');
    status.textContent = consentReceipts.length
        ? `Showing ${filtered.length} of ${consentReceipts.length} most recent choices.`
        : 'No choices have been recorded yet.';
    const counts = ['accept_all', 'reject_all', 'custom'].map(choice => ({
        label: choice.replace('_', ' '),
        value: consentReceipts.filter(item => item.choice === choice).length
    }));
    renderAdminInsights('settings', [
        { label: 'Receipts loaded', value: consentReceipts.length },
        { label: 'Accept all', value: counts[0].value },
        { label: 'Reject all', value: counts[1].value },
        { label: 'Custom', value: counts[2].value }
    ], counts);
}

const STAFF_PERMISSION_CATALOG = [
    'categories.read', 'categories.create', 'categories.update', 'categories.archive',
    'products.read', 'products.create', 'products.update', 'products.archive', 'products.images.upload',
    'orders.read', 'orders.update', 'customers.read', 'customers.update',
    'coupons.read', 'coupons.create', 'coupons.update', 'coupons.archive',
    'inventory.read', 'inventory.adjust', 'inventory.set',
    'reports.read', 'settings.read', 'settings.update', 'support.read', 'support.update',
    'feedback.read', 'feedback.update', 'accounts.read', 'accounts.transactions.read',
    'accounts.transactions.create', 'accounts.salaries.read', 'accounts.salaries.pay',
    'sales.read', 'sales.create', 'suppliers.read', 'suppliers.create', 'couriers.read', 'couriers.create',
];

function isBuiltInRole(roleName) {
    return ['Super Admin', 'Inventory Manager', 'Order Manager', 'Sales Manager', 'Accountant', 'Viewer'].includes(roleName);
}

async function loadAuditLog(event) {
    if (event) {
        event.preventDefault();
        auditLogPage = 1;
    }
    if (!adminPermissions?.includes('*.*')) return;
    const status = document.getElementById('audit-log-status');
    status.textContent = 'Loading audit log…';
    const params = new URLSearchParams({ page: String(auditLogPage), per_page: '50' });
    const search = document.getElementById('audit-log-search').value.trim();
    const action = document.getElementById('audit-log-action').value.trim();
    if (search) params.set('q', search);
    if (action) params.set('action', action);
    try {
        const response = await adminFetch(`${API_BASE}/admin-audit.php?${params}`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Audit log could not be loaded.');
        }
        document.querySelector('#audit-log-table tbody').innerHTML = result.data.map(entry => `
            <tr>
                <td>${escapeAdminHtml(entry.created_at)}</td>
                <td>${escapeAdminHtml(entry.full_name || entry.username || 'Unknown admin')}</td>
                <td>${escapeAdminHtml(entry.action)}</td>
                <td>${escapeAdminHtml(entry.entity_type)} #${escapeAdminHtml(entry.entity_id ?? '')}</td>
                <td><details><summary>View changes</summary><pre style="white-space:pre-wrap;max-width:320px;">Old: ${escapeAdminHtml(formatAuditValue(entry.old_values))}
New: ${escapeAdminHtml(formatAuditValue(entry.new_values))}</pre></details></td>
                <td>${escapeAdminHtml(entry.ip_address)}</td>
            </tr>
        `).join('');
        const total = Number(result.pagination?.total) || 0;
        const pageCount = Math.max(1, Math.ceil(total / 50));
        auditLogPage = Math.min(auditLogPage, pageCount);
        document.getElementById('audit-log-page-status').textContent = `${auditLogPage} / ${pageCount} pages · ${total} event(s)`;
        document.getElementById('audit-log-previous').disabled = auditLogPage <= 1;
        document.getElementById('audit-log-next').disabled = auditLogPage >= pageCount;
        status.textContent = `${result.data.length} audit event(s) loaded.`;
    } catch (error) {
        status.textContent = error.message || 'Audit log could not be loaded.';
    }
}

function formatAuditValue(value) {
    if (typeof value !== 'string' || value === '') return '—';
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
}

function changeAuditLogPage(delta) {
    if (!adminPermissions?.includes('*.*')) return;
    auditLogPage = Math.max(1, auditLogPage + delta);
    void loadAuditLog();
}

async function loadStaffManagement() {
    if (!adminPermissions?.includes('*.*')) return;
    const status = document.getElementById('staff-management-status');
    try {
        const [usersResponse, rolesResponse] = await Promise.all([
            adminFetch(`${API_BASE}/auth?action=admin_list_users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
            adminFetch(`${API_BASE}/auth?action=admin_list_roles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        ]);
        const [users, roles] = await Promise.all([usersResponse.json(), rolesResponse.json()]);
        if (!usersResponse.ok || users.status !== 'success' || !Array.isArray(users.data)
            || !rolesResponse.ok || roles.status !== 'success' || !Array.isArray(roles.data)) {
            throw new Error(users.error || roles.error || 'Could not load staff accounts and roles.');
        }
        staffAccounts = users.data;
        staffRoles = roles.data;
        const options = staffRoles.map(role => `<option value="${escapeAdminHtml(role.name)}">${escapeAdminHtml(role.name)}</option>`).join('');
        document.getElementById('staff-new-role').innerHTML = options;
        const resetTargets = staffAccounts.filter(user => Number(user.is_active) === 1 && user.is_current !== true);
        document.getElementById('staff-reset-admin').innerHTML = resetTargets.length
            ? `<option value="">Choose an administrator</option>${resetTargets.map(user => `<option value="${Number(user.id)}">${escapeAdminHtml(user.full_name)} (${escapeAdminHtml(user.username)})</option>`).join('')}`
            : '<option value="">No other active administrator accounts</option>';
        document.getElementById('admin-roles-table').querySelector('tbody').innerHTML = staffRoles.map(role => {
            const builtIn = isBuiltInRole(role.name);
            return `<tr><td>${escapeAdminHtml(role.name)}${builtIn ? ' <small>(built-in)</small>' : ''}</td>
                <td>${role.permissions.length} grant(s)</td>
                <td>${builtIn ? '' : `<button type="button" class="admin-btn" data-csp-click="editAdminRole" data-role-name="${escapeAdminHtml(role.name)}">Edit</button>
                    <button type="button" class="admin-btn" style="background:#7f1d1d;color:#fff;" data-csp-click="deleteAdminRole" data-role-name="${escapeAdminHtml(role.name)}">Delete</button>`}</td></tr>`;
        }).join('');
        const tableRows = staffAccounts.map(user => {
            const active = Number(user.is_active) === 1;
            const roleOptions = staffRoles.map(role => `<option value="${escapeAdminHtml(role.name)}" ${role.name === user.role ? 'selected' : ''}>${escapeAdminHtml(role.name)}</option>`).join('');
            const row = `<tr><td>${escapeAdminHtml(user.full_name)}</td><td>${escapeAdminHtml(user.username)}</td>
                <td><select id="staff-role-${Number(user.id)}" class="admin-input" ${!active ? 'disabled' : ''}>${roleOptions}</select>
                <button type="button" class="admin-btn" data-csp-click="assignStaffRole" data-admin-id="${Number(user.id)}" ${!active ? 'disabled' : ''}>Save role</button></td>
                <td>${active ? 'Active' : 'Deactivated'}</td>
                <td>${active && user.is_current !== true ? `<button type="button" class="admin-btn" style="background:#7f1d1d;color:#fff;" data-csp-click="deactivateStaff" data-admin-id="${Number(user.id)}">Deactivate</button>` : ''}</td></tr>`;
            return row;
        }).join('');
        document.querySelector('#staff-table tbody').innerHTML = tableRows;
        document.querySelector('#team-screen-table tbody').innerHTML = tableRows.replaceAll('staff-role-', 'team-staff-role-');
        renderAdminInsights('team', [
            { label: 'Staff accounts', value: staffAccounts.length },
            { label: 'Active accounts', value: staffAccounts.filter(user => Number(user.is_active) === 1).length },
            { label: 'Roles', value: staffRoles.length }
        ], staffRoles.map(role => ({
            label: role.name,
            value: staffAccounts.filter(user => Number(user.is_active) === 1 && user.role === role.name).length
        })));
        renderRolePermissionChoices();
        if (status) status.textContent = `${staffAccounts.length} account(s), ${staffRoles.length} role(s) loaded.`;
    } catch (error) {
        if (status) status.textContent = error.message || 'Could not load staff management.';
    }
}

function renderRolePermissionChoices(selected = []) {
    const container = document.getElementById('admin-role-permissions');
    container.innerHTML = STAFF_PERMISSION_CATALOG.map(permission => `
        <label><input type="checkbox" value="${permission}" ${selected.includes(permission) ? 'checked' : ''}> ${permission.replace(/\./g, ' › ')}</label>
    `).join('');
}

async function createStaffAccount(event) {
    event.preventDefault();
    if (!adminPermissions?.includes('*.*')) return;
    const status = document.getElementById('staff-management-status');
    const payload = {
        username: document.getElementById('staff-new-username').value.trim(),
        full_name: document.getElementById('staff-new-name').value.trim(),
        password: document.getElementById('staff-new-password').value,
        role: document.getElementById('staff-new-role').value
    };
    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_create_user`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') throw new Error(result.error || 'Could not create account.');
        document.getElementById('staff-create-form').reset();
        status.textContent = 'Staff account created. The user must change this temporary password after signing in.';
        await loadStaffManagement();
    } catch (error) {
        status.textContent = error.message || 'Could not create account.';
    }
}

async function resetStaffPassword(event) {
    event.preventDefault();
    if (!adminPermissions?.includes('*.*')) return;
    const status = document.getElementById('staff-password-reset-status');
    const temporaryPassword = document.getElementById('staff-reset-temporary-password').value;
    if (temporaryPassword !== document.getElementById('staff-reset-confirm-password').value) {
        status.textContent = 'The temporary passwords do not match.';
        return;
    }

    const adminId = Number(document.getElementById('staff-reset-admin').value);
    if (!Number.isSafeInteger(adminId) || adminId < 1) {
        status.textContent = 'Choose an active administrator account other than your own.';
        return;
    }
    if (!confirm('Reset this administrator’s password, sign out their active sessions, and require a password change at next sign-in?')) return;

    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_reset_user_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_id: adminId,
                current_password: document.getElementById('staff-reset-current-password').value,
                temporary_password: temporaryPassword
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not reset the administrator password.');
        }
        document.getElementById('staff-password-reset-form').reset();
        status.textContent = 'Temporary password set. Share it with the administrator through a secure channel; they must change it at next sign-in.';
        await loadStaffManagement();
    } catch (error) {
        status.textContent = error.message || 'Could not reset the administrator password.';
    }
}

async function assignStaffRole(button) {
    if (!adminPermissions?.includes('*.*')) return;
    const adminId = Number(button.dataset.adminId);
    const role = button.closest('tr')?.querySelector('select')?.value;
    if (!Number.isSafeInteger(adminId) || adminId < 1 || !role) return;
    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_assign_role`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_id: adminId, role })
        });
        const result = await response.json();
        document.getElementById('staff-management-status').textContent = response.ok
            ? 'Staff role updated.' : (result.error || 'Could not update staff role.');
        if (response.ok) await loadStaffManagement();
    } catch (error) {
        document.getElementById('staff-management-status').textContent = error.message || 'Could not update staff role.';
    }
}

async function deactivateStaff(adminId) {
    if (!adminPermissions?.includes('*.*') || !Number.isSafeInteger(adminId) || adminId < 1
        || !confirm('Deactivate this staff account and revoke its sessions?')) return;
    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_deactivate_user`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId })
        });
        const result = await response.json();
        document.getElementById('staff-management-status').textContent = response.ok
            ? 'Account deactivated and sessions revoked.' : (result.error || 'Could not deactivate account.');
        if (response.ok) await loadStaffManagement();
    } catch (error) {
        document.getElementById('staff-management-status').textContent = error.message || 'Could not deactivate account.';
    }
}

async function saveAdminRole(event) {
    event.preventDefault();
    if (!adminPermissions?.includes('*.*')) return;
    const name = document.getElementById('admin-role-name').value.trim();
    const permissions = [...document.querySelectorAll('#admin-role-permissions input:checked')].map(input => input.value);
    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_save_role`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, permissions })
        });
        const result = await response.json();
        document.getElementById('staff-management-status').textContent = response.ok
            ? 'Custom role saved.' : (result.error || 'Could not save this role.');
        if (response.ok) {
            document.getElementById('admin-role-form').reset();
            renderRolePermissionChoices();
            await loadStaffManagement();
        }
    } catch (error) {
        document.getElementById('staff-management-status').textContent = error.message || 'Could not save this role.';
    }
}

function editAdminRole(roleName) {
    const role = staffRoles.find(item => item.name === roleName && !isBuiltInRole(item.name));
    if (!role) return;
    document.getElementById('admin-role-name').value = role.name;
    renderRolePermissionChoices(role.permissions);
    document.getElementById('admin-role-name').focus();
}

async function deleteAdminRole(roleName) {
    if (!adminPermissions?.includes('*.*') || isBuiltInRole(roleName)
        || !confirm(`Delete the custom role "${roleName}"?`)) return;
    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_delete_role`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roleName })
        });
        const result = await response.json();
        document.getElementById('staff-management-status').textContent = response.ok
            ? 'Custom role deleted.' : (result.error || 'Could not delete the role.');
        if (response.ok) await loadStaffManagement();
    } catch (error) {
        document.getElementById('staff-management-status').textContent = error.message || 'Could not delete the role.';
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    if (!hasAdminPermission('settings.update')) return;
    const payload = {
        store_name: document.getElementById('set_store_name').value,
        announcement_text: document.getElementById('set_announcement_text').value.trim(),
        delivery_fee_dhaka: document.getElementById('set_fee_dhaka').value,
        delivery_fee_outside_dhaka: document.getElementById('set_fee_outside_dhaka').value,
        bkash_number: document.getElementById('set_bkash').value,
        nagad_number: document.getElementById('set_nagad').value,
        rocket_number: document.getElementById('set_rocket').value,
        social_heading: document.getElementById('set_social_heading').value.trim(),
        social_instagram_label: document.getElementById('set_social_instagram_label').value.trim(),
        social_instagram_url: document.getElementById('set_social_instagram_url').value.trim(),
        social_x_label: document.getElementById('set_social_x_label').value.trim(),
        social_x_url: document.getElementById('set_social_x_url').value.trim(),
        social_facebook_label: document.getElementById('set_social_facebook_label').value.trim(),
        social_facebook_url: document.getElementById('set_social_facebook_url').value.trim()
    };
    const status = document.getElementById('store-settings-status');
    const saveButton = document.querySelector('#store-settings-form button[type="submit"]');
    if (saveButton) saveButton.disabled = true;
    try {
        if (adminPermissions?.includes('*.*')) {
            const imageFile = document.getElementById('set_promo_image').files[0];
            payload.homepage_promo_eyebrow = document.getElementById('set_promo_eyebrow').value.trim();
            payload.homepage_promo_title = document.getElementById('set_promo_title').value.trim();
            payload.homepage_promo_description = document.getElementById('set_promo_description').value.trim();
            payload.homepage_promo_button_text = document.getElementById('set_promo_button_text').value.trim();
            payload.homepage_promo_link = document.getElementById('set_promo_link').value.trim();
            if (payload.homepage_promo_link && !isSafeHomepageUrl(payload.homepage_promo_link)) {
                throw new Error('Enter a safe HTTP(S) URL or a store-relative banner destination.');
            }
            if (imageFile) currentPromoImage = await uploadHeroImage(imageFile, 'desktop');
            else if (document.getElementById('set_promo_remove_image').checked) currentPromoImage = '';
            payload.homepage_promo_image = currentPromoImage;
        }
        const response = await adminFetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save store settings.');
        }
        applyAdminStoreName(payload.store_name);
        document.getElementById('set_promo_image').value = '';
        document.getElementById('set_promo_remove_image').checked = false;
        document.getElementById('set_promo_image_current').textContent = currentPromoImage
            ? `Current image: ${currentPromoImage}` : 'No banner image selected; the banner uses its text-only style.';
        if (status) status.textContent = 'Settings updated successfully.';
    } catch (error) {
        if (status) status.textContent = error.message || 'Could not save store settings.';
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

const adminClickActions = {
    toggleAdminPasswordPanel: () => toggleAdminPasswordPanel(),
    handleAdminLogout: () => handleAdminLogout(),
    openModule: element => openModule(element.dataset.cspValue),
    closeModule: () => closeModule(),
    showAddProductModal: () => showAddProductModal(),
    hideProductForm: () => hideProductForm(),
    handleAddCategory: () => handleAddCategory(),
    editCategory: element => editCategory(Number(element.dataset.categoryId)),
    archiveCategory: element => { void archiveCategory(Number(element.dataset.categoryId)); },
    resetCategoryForm: () => resetCategoryForm(),
    toggleCustomerVip: element => { void toggleCustomerVip(element); },
    resetCouponForm: () => resetCouponForm(),
    editProduct: element => editProduct(Number(element.dataset.productId)),
    deleteProduct: element => deleteProduct(Number(element.dataset.productId)),
    editCoupon: element => editCoupon(Number(element.dataset.couponId)),
    deleteCoupon: element => deleteCoupon(Number(element.dataset.couponId)),
    addHeroSlide: () => addHomepageSlide(),
    removeHeroSlide: element => removeHomepageSlide(Number(element.dataset.slideIndex)),
    moveHeroSlide: element => moveHomepageSlide(
        Number(element.dataset.slideIndex),
        Number(element.dataset.slideDirection)
    ),
    saveHeroSlides: () => { void saveHomepageSlides(); },
    addPrimaryNavLink: () => addPrimaryNavLink(),
    movePrimaryNavLink: element => movePrimaryNavLink(
        Number(element.dataset.linkIndex),
        Number(element.dataset.linkDirection)
    ),
    removePrimaryNavLink: element => removePrimaryNavLink(Number(element.dataset.linkIndex)),
    savePrimaryNavLinks: () => { void savePrimaryNavLinks(); },
    loadConsentLogs: () => { void loadConsentLogs(); },
    editAdminRole: element => editAdminRole(element.dataset.roleName),
    deleteAdminRole: element => { void deleteAdminRole(element.dataset.roleName); },
    deactivateStaff: element => { void deactivateStaff(Number(element.dataset.adminId)); },
    assignStaffRole: element => { void assignStaffRole(element); },
    loadFeedback: () => { void loadFeedback(); },
    loadNotificationLogs: () => { void loadNotificationLogs(); },
    saveTrackingSlot: element => { void saveTrackingSlot(element); },
    disableTrackingSlot: element => { void saveTrackingSlot(element, true); },
    loadTrackingAudit: element => { void loadTrackingAudit(element); },
    verifyTrackingInstallation: () => { void verifyTrackingInstallation(); },
    previewTrackingInstallation: () => { void previewTrackingInstallation(); },
    purgeTrackingCache: () => { void purgeTrackingCache(); },
    openOrderDetails: element => openOrderDetails(Number(element.dataset.orderId)),
    addOrderAdminNote: event => { void addOrderAdminNote(event); },
    closeOrderDetails: () => closeOrderDetails(),
    previousOrdersPage: () => changeOrdersPage(-1),
    nextOrdersPage: () => changeOrdersPage(1),
    previousAuditLogPage: () => changeAuditLogPage(-1),
    nextAuditLogPage: () => changeAuditLogPage(1),
    filterSupportTickets: event => { void filterSupportTickets(event); },
    saveSupportTicket: event => { void saveSupportTicket(event); },
    sendSupportInternalNote: event => { void sendSupportInternalNote(event); },
    moderateFeedback: element => {
        void updateFeedback(Number(element.dataset.feedbackId), element.dataset.feedbackAction);
    },
    replyToFeedback: element => {
        const id = Number(element.dataset.feedbackId);
        const reply = document.querySelector(`[data-feedback-reply="${id}"]`)?.value || '';
        void updateFeedback(id, 'reply', reply);
    },
    selectSupportConversation: element => { void selectSupportConversation(Number(element.dataset.conversationId)); },
    closeSupportConversation: () => { void closeSupportConversation(); },
    deleteSupportConversation: () => { void deleteSupportConversation(); },
    editSupportFaq: element => editSupportFaq(Number(element.dataset.faqId)),
    deleteSupportFaq: element => { void deleteSupportFaq(Number(element.dataset.faqId)); },
    resetSupportFaq: () => resetSupportFaq(),
    adjustInventory: element => adjustInventory(
        Number(element.dataset.productId),
        Number(element.dataset.quantityDelta)
    ),
    exportCustomersCsv: () => exportCustomersCsv(),
    exportProductsCsv: () => exportProductsCsv(),
    exportReportsCsv: () => exportReportsCsv(),
    toggleStockMovementHistory: () => { void toggleStockMovementHistory(); },
    resetDashboardRange: () => resetDashboardRange(),
    openCustomerProfile: element => { void openCustomerProfile(Number(element.dataset.customerId)); },
    closeCustomerProfile: () => closeCustomerProfile()
};
const adminSubmitActions = {
    handleAdminLogin: event => handleAdminLogin(event),
    handleAdminPasswordChange: event => handleAdminPasswordChange(event),
    handleAddProduct: event => handleAddProduct(event),
    handleSaveCoupon: event => handleSaveCoupon(event),
    handleSaveSettings: event => handleSaveSettings(event),
    filterOrders: event => filterOrders(event),
    loadAuditLog: event => { void loadAuditLog(event); },
    loadDashboard: event => { void loadDashboard(event); },
    sendSupportReply: event => { void sendSupportReply(event); },
    saveSupportSettings: event => { void saveSupportSettings(event); },
    saveSupportFaq: event => { void saveSupportFaq(event); },
    createStaffAccount: event => { void createStaffAccount(event); },
    resetStaffPassword: event => { void resetStaffPassword(event); },
    saveAdminRole: event => { void saveAdminRole(event); },
    loadReports: () => loadAdminModuleData('reports', loadReports)
};

document.addEventListener('click', event => {
    const element = event.target instanceof Element
        ? event.target.closest('[data-csp-click]')
        : null;
    if (!element) return;
    const actionName = element.dataset.cspClick;
    if (Object.prototype.hasOwnProperty.call(adminClickActions, actionName)) {
        adminClickActions[actionName](element);
    } else {
        console.error(`Unknown admin click action: ${actionName}`);
    }
});
document.addEventListener('change', event => {
    if (event.target instanceof Element
        && (event.target.id === 'consent-log-choice')) {
        renderConsentLogRows();
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest('[data-hero-slide-index]');
    if (!card) return;
    if (target.matches('[data-hero-field="link_type"]')) {
        const linkType = target.value;
        const destination = card.querySelector('[data-hero-destination-field]');
        const select = card.querySelector('[data-hero-field="link_value"]');
        const customUrl = card.querySelector('[data-hero-url-field]');
        const customInput = card.querySelector('[data-hero-field="custom_url"]');
        const options = heroSlideDestinationOptions({ link_type: linkType, link_value: '' });
        destination.hidden = linkType === 'url';
        select.innerHTML = options;
        select.disabled = linkType === 'url';
        select.required = linkType !== 'url';
        customUrl.hidden = linkType !== 'url';
        customInput.disabled = linkType !== 'url';
        customInput.required = linkType === 'url';
    } else if (target.matches('[data-hero-field="mobile_file"]')) {
        const removeCheckbox = card.querySelector('[data-hero-field="remove_mobile"]');
        if (target.files.length > 0) removeCheckbox.checked = false;
    }
});
document.addEventListener('keydown', event => {
    const input = event.target;
    if (!(input instanceof HTMLTextAreaElement)
        || input.id !== 'support-admin-reply'
        || event.key !== 'Enter'
        || event.shiftKey
        || event.isComposing) {
        return;
    }
    event.preventDefault();
    input.form?.requestSubmit();
});
document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.cspSubmit) return;
    event.preventDefault();
    const actionName = form.dataset.cspSubmit;
    if (Object.prototype.hasOwnProperty.call(adminSubmitActions, actionName)) {
        adminSubmitActions[actionName](event);
    } else {
        console.error(`Unknown admin form action: ${actionName}`);
    }
});
document.addEventListener('change', event => {
    const element = event.target instanceof Element
        ? event.target.closest('[data-csp-change]')
        : null;
    if (!element) return;
    if (element.dataset.cspChange === 'handleProductImageSelection') {
        handleProductImageSelection(event);
    } else if (element.dataset.cspChange === 'feedbackFilter') {
        void loadFeedback();
    } else if (element.dataset.cspChange === 'supportOnline') {
        void setSupportPresence(element.checked);
    } else if (element.dataset.cspChange === 'updateOrderStatus') {
        updateOrderStatus(Number(element.dataset.orderId), element.value);
    } else if (element.dataset.cspChange === 'updateOrderPaymentStatus') {
        updateOrderPaymentStatus(Number(element.dataset.orderId), element.value);
    } else if (element.dataset.cspChange === 'assignStaffRole') {
        void assignStaffRole(Number(element.dataset.adminId));
    } else if (element.dataset.cspChange === 'filterSupportTickets') {
        void loadSupportInbox();
    } else {
        console.error(`Unknown admin change action: ${element.dataset.cspChange}`);
    }
});
document.getElementById('consent-log-search')?.addEventListener('input', renderConsentLogRows);
document.getElementById('new-cat-image')?.addEventListener('change', handleCategoryImageSelection);
document.getElementById('customers-search')?.addEventListener('input', renderCustomerRows);
document.getElementById('customers-vip-filter')?.addEventListener('change', renderCustomerRows);
document.getElementById('customers-sort')?.addEventListener('change', renderCustomerRows);
document.getElementById('orders-sort')?.addEventListener('change', () => {
    loadOrders().catch(error => {
        console.error('Orders could not be sorted.', error);
        window.alert(error.message || 'Orders could not be sorted.');
    });
});
document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
    const fallback = image.dataset.imageFallback;
    if (!fallback) return;
    image.dataset.fallbackApplied = 'true';
    image.src = fallback;
}, true);

initializeAdminSessionBroadcast();
document.addEventListener('DOMContentLoaded', initializeAdmin);
