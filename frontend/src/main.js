import {
  SendRequest,
  SaveCollections,
  LoadCollections,
} from "../wailsjs/go/main/App.js";
import { parsePostmanCollection } from "./collectionImport.js";

// ============================
// STATE
// ============================
let collections = []; // Array<Collection>
let activeRequestId = null; // currently highlighted request in sidebar
let activeCollectionId = null;
let activeCollectionContext = null; // for right-click context menu
let pendingReopenSave = false; // re-open save modal after creating a new collection from it
let lastRawResponse = "";
let lastContentType = "";
let lastRespHeaders = {};
let storageReady = false;
let saveQueue = Promise.resolve();

// ============================
// DOM REFS
// ============================
const urlInput       = document.getElementById("url");
const methodSelect   = document.getElementById("method");
const timeoutInput   = document.getElementById("timeoutSeconds");
const reqBody        = document.getElementById("reqBody");
const sendBtn        = document.getElementById("sendBtn");
const respBody       = document.getElementById("respBody");
const statusBadge    = document.getElementById("statusBadge");
const timeMsEl       = document.getElementById("timeMs");
const sizeBytesEl    = document.getElementById("sizeBytes");
const collectionTree = document.getElementById("collectionTree");
const newCollectionBtn   = document.getElementById("newCollectionBtn");
const importCollectionBtn = document.getElementById("importCollectionBtn");
const importCollectionFile = document.getElementById("importCollectionFile");
const importStatus = document.getElementById("importStatus");
const saveRequestBtn     = document.getElementById("saveRequestBtn");
const formatSelect   = document.getElementById("formatSelect");
const searchInput    = document.getElementById("searchInput");
const reqNameInput   = document.getElementById("reqName");
const respHeadersList= document.getElementById("respHeaders");
const copyRespBtn    = document.getElementById("copyRespBtn");
const bodyTypeSelect = document.getElementById("bodyType");
const formatBodyBtn  = document.getElementById("formatBodyBtn");
const authTypeSelect = document.getElementById("authType");
const authFields     = document.getElementById("authFields");
const paramsRows     = document.getElementById("paramsRows");
const headersRows    = document.getElementById("headersRows");
const addParamBtn    = document.getElementById("addParamBtn");
const addHeaderBtn   = document.getElementById("addHeaderBtn");

// Modals
const collectionModal    = document.getElementById("collectionModal");
const modalTitle         = document.getElementById("modalTitle");
const collectionNameInput= document.getElementById("collectionNameInput");
const closeModal         = document.getElementById("closeModal");
const cancelModal        = document.getElementById("cancelModal");
const confirmModal       = document.getElementById("confirmModal");
const saveRequestModal   = document.getElementById("saveRequestModal");
const saveReqNameInput   = document.getElementById("saveReqNameInput");
const saveToCollection   = document.getElementById("saveToCollection");
const closeSaveModal     = document.getElementById("closeSaveModal");
const cancelSaveModal    = document.getElementById("cancelSaveModal");
const confirmSaveModal   = document.getElementById("confirmSaveModal");
const createNewColFromSave = document.getElementById("createNewColFromSave");

// Context Menu
const contextMenu      = document.getElementById("contextMenu");
const ctxRename        = document.getElementById("ctx-rename");
const ctxAddRequest    = document.getElementById("ctx-add-request");
const ctxDelete        = document.getElementById("ctx-delete");

// ============================
// INIT
// ============================
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const loaded = await LoadCollections();
    if (Array.isArray(loaded) && loaded.length > 0) {
      collections = loaded.map((c) => ({
        ...c,
        requests: Array.isArray(c.requests) ? c.requests : [],
        _open: true,
      }));
    }
    storageReady = true;
  } catch (e) {
    console.error("Failed to load collections", e);
    window.alert("Failed to load collections. Changes cannot be saved until the storage issue is fixed: " + e);
  }
  renderTree();
  addKvRow("paramsRows");
  addKvRow("headersRows");
  renderAuthFields();
});

// ============================
// TABS
// ============================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".editor-pane").forEach((p) => p.classList.remove("active"));
    e.currentTarget.classList.add("active");
    document.getElementById(e.currentTarget.dataset.target).classList.add("active");
  });
});

document.querySelectorAll(".resp-tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".resp-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".resp-tab-pane").forEach((p) => p.classList.remove("active"));
    e.currentTarget.classList.add("active");
    document.getElementById(e.currentTarget.dataset.rtarget).classList.add("active");
  });
});

// ============================
// KV EDITOR (Params & Headers)
// ============================
function addKvRow(containerId, key = "", value = "") {
  const container = document.getElementById(containerId);
  const row = document.createElement("div");
  row.className = "kv-row";
  row.innerHTML = `
    <input type="text" placeholder="Key" value="${escHtml(key)}" />
    <input type="text" placeholder="Value" value="${escHtml(value)}" />
    <button class="kv-del" title="Remove">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  row.querySelector(".kv-del").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

addParamBtn.addEventListener("click", () => addKvRow("paramsRows"));
addHeaderBtn.addEventListener("click", () => addKvRow("headersRows"));

function getKvMap(containerId) {
  const rows = document.getElementById(containerId).querySelectorAll(".kv-row");
  const map = {};
  rows.forEach((row) => {
    const inputs = row.querySelectorAll("input");
    const k = inputs[0].value.trim();
    const v = inputs[1].value.trim();
    if (k) {
      if (containerId === "headersRows") {
        for (const existing of Object.keys(map)) {
          if (existing.toLowerCase() === k.toLowerCase()) delete map[existing];
        }
      }
      map[k] = v;
    }
  });
  return map;
}

function setKvRows(containerId, map) {
  document.getElementById(containerId).innerHTML = "";
  if (!map || Object.keys(map).length === 0) {
    addKvRow(containerId);
    return;
  }
  for (const [k, v] of Object.entries(map)) {
    addKvRow(containerId, k, v);
  }
}

// ============================
// AUTH
// ============================
authTypeSelect.addEventListener("change", renderAuthFields);

function renderAuthFields() {
  const type = authTypeSelect.value;
  authFields.innerHTML = "";

  if (type === "bearer") {
    authFields.innerHTML = `
      <label>Token</label>
      <input id="authBearerToken" type="text" placeholder="eyJhbGci..." />
    `;
  } else if (type === "basic") {
    authFields.innerHTML = `
      <label>Username</label>
      <input id="authBasicUser" type="text" placeholder="username" />
      <label>Password</label>
      <input id="authBasicPass" type="password" placeholder="••••••••" />
    `;
  } else if (type === "api-key") {
    authFields.innerHTML = `
      <label>Header Name</label>
      <input id="authApiKeyName" type="text" placeholder="X-API-Key" />
      <label>Value</label>
      <input id="authApiKeyVal" type="text" placeholder="api_key_here" />
    `;
  }
}

function getAuthHeaders() {
  const type = authTypeSelect.value;
  const headers = {};
  if (type === "bearer") {
    const token = document.getElementById("authBearerToken")?.value.trim();
    if (token) headers["Authorization"] = token.startsWith("Bearer ") ? token : "Bearer " + token;
  } else if (type === "basic") {
    const user = document.getElementById("authBasicUser")?.value || "";
    const pass = document.getElementById("authBasicPass")?.value || "";
    if (user) {
      const bytes = new TextEncoder().encode(user + ":" + pass);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      headers["Authorization"] = "Basic " + btoa(binary);
    }
  } else if (type === "api-key") {
    const name = document.getElementById("authApiKeyName")?.value.trim();
    const val  = document.getElementById("authApiKeyVal")?.value.trim();
    if (name && val) headers[name] = val;
  }
  return headers;
}

function mergeHeaders(custom, auth) {
  const headers = { ...custom };
  for (const [key, value] of Object.entries(auth)) {
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === key.toLowerCase()) delete headers[existing];
    }
    headers[key] = value;
  }
  return headers;
}

function setDefaultContentType(headers, type, body) {
  if (!body.trim() || Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) return;
  if (type === "json") headers["Content-Type"] = "application/json";
  else if (type === "form") headers["Content-Type"] = "application/x-www-form-urlencoded";
}

function looksLikeJsonBody(body) {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Body Type → auto set Content-Type
bodyTypeSelect.addEventListener("change", () => {
  if (bodyTypeSelect.value === "json") {
    reqBody.placeholder = '{\n  "key": "value"\n}';
  } else if (bodyTypeSelect.value === "form") {
    reqBody.placeholder = "key=value&foo=bar";
  } else {
    reqBody.placeholder = "Request body...";
  }
});

// Format JSON body
formatBodyBtn.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(reqBody.value);
    reqBody.value = JSON.stringify(parsed, null, 2);
  } catch (_) {
    // Not valid JSON, ignore
  }
});

// ============================
// URL with Params
// ============================
function getParamPairs() {
  return Array.from(paramsRows.querySelectorAll(".kv-row"), (row) => {
    const inputs = row.querySelectorAll("input");
    return [inputs[0].value.trim(), inputs[1].value];
  }).filter(([key]) => key);
}

function syncParamsFromUrl() {
  const query = urlInput.value.split("#")[0].split("?")[1];
  paramsRows.innerHTML = "";
  if (!query) {
    addKvRow("paramsRows");
    return;
  }
  for (const [key, value] of new URLSearchParams(query)) addKvRow("paramsRows", key, value);
  if (!paramsRows.children.length) addKvRow("paramsRows");
}

urlInput.addEventListener("change", syncParamsFromUrl);

function buildUrlWithParams() {
  const raw = urlInput.value.trim();
  const pairs = getParamPairs();
  const base = raw.split("#")[0].split("?")[0];
  if (pairs.length === 0) return base;
  return base + "?" + new URLSearchParams(pairs).toString();
}

// ============================
// SEND REQUEST
// ============================
sendBtn.addEventListener("click", sendRequest);

timeoutInput.addEventListener("input", () => timeoutInput.setCustomValidity(""));

function getTimeoutSeconds() {
  const raw = timeoutInput.value.trim();
  const seconds = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
    timeoutInput.setCustomValidity("Enter a timeout from 1 to 3600 seconds.");
    timeoutInput.reportValidity();
    return null;
  }
  timeoutInput.setCustomValidity("");
  return seconds;
}

async function sendRequest() {
  const timeoutSeconds = getTimeoutSeconds();
  if (timeoutSeconds === null) return;
  const finalUrl = buildUrlWithParams();
  const headersFromKv = getKvMap("headersRows");
  const authHeaders = getAuthHeaders();
  const allHeaders = mergeHeaders(headersFromKv, authHeaders);

  const bodyType = bodyTypeSelect.value;
  setDefaultContentType(allHeaders, bodyType, reqBody.value);

  const req = {
    id: "",
    name: reqNameInput.value || "",
    method: methodSelect.value,
    url: finalUrl,
    headers: allHeaders,
    body: bodyType !== "none" ? reqBody.value : "",
    timeout_seconds: timeoutSeconds,
  };

  sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="63" stroke-dashoffset="20" style="animation:spin 1s linear infinite"/></svg> Sending...`;
  sendBtn.disabled = true;
  respBody.textContent = "Waiting for response...";
  lastRawResponse = "";
  lastContentType = "";
  lastRespHeaders = {};
  renderRespHeaders();
  timeMsEl.textContent = "0 ms";
  sizeBytesEl.textContent = "0 B";
  statusBadge.textContent = "—";
  statusBadge.className = "status-badge";

  try {
    const res = await SendRequest(req);

    if (res.error) {
      respBody.textContent = "Error: " + res.error;
      statusBadge.textContent = "ERR";
      statusBadge.className = "status-badge error";
      timeMsEl.textContent = res.time_ms + " ms";
      sizeBytesEl.textContent = "0 B";
    } else {
      const code = res.status_code;
      statusBadge.textContent = res.status_text || code;
      statusBadge.className = "status-badge " + (code < 300 ? "success" : code < 500 ? "warning" : "error");
      timeMsEl.textContent = res.time_ms + " ms";
      sizeBytesEl.textContent = formatBytes(res.size_bytes);

      lastRawResponse = res.body;
      lastContentType = (res.headers?.["Content-Type"] || res.headers?.["content-type"] || "").toLowerCase();
      lastRespHeaders = res.headers || {};

      renderResponse();
      renderRespHeaders();
    }
  } catch (err) {
    respBody.textContent = "Fatal Error: " + err;
    statusBadge.textContent = "ERR";
    statusBadge.className = "status-badge error";
  } finally {
    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;
    sendBtn.disabled = false;
  }
}

// ============================
// RESPONSE RENDERING
// ============================
formatSelect.addEventListener("change", renderResponse);

function renderResponse() {
  const fmt = formatSelect.value;
  try {
    if (fmt === "json" || (fmt === "auto" && lastContentType.includes("json"))) {
      const parsed = JSON.parse(lastRawResponse);
      respBody.innerHTML = highlightJSON(JSON.stringify(parsed, null, 2));
    } else if (fmt === "xml" || (fmt === "auto" && (lastContentType.includes("xml") || lastContentType.includes("html")))) {
      respBody.innerHTML = formatXML(lastRawResponse);
    } else {
      respBody.textContent = lastRawResponse;
    }
  } catch (_) {
    respBody.textContent = lastRawResponse;
  }
}

function renderRespHeaders() {
  respHeadersList.innerHTML = "";
  for (const [k, v] of Object.entries(lastRespHeaders)) {
    const row = document.createElement("div");
    row.className = "resp-header-row";
    row.innerHTML = `<span class="resp-header-key">${escHtml(k)}</span><span class="resp-header-val">${escHtml(v)}</span>`;
    respHeadersList.appendChild(row);
  }
}

copyRespBtn.addEventListener("click", () => {
  if (!lastRawResponse) return;
  navigator.clipboard.writeText(lastRawResponse).then(() => {
    copyRespBtn.textContent = "Copied!";
    setTimeout(() => copyRespBtn.textContent = "Copy", 1500);
  });
});

// ============================
// HIGHLIGHTING
// ============================
function highlightJSON(str) {
  let s = str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return s.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (m) => {
      if (/^"/.test(m)) return /:$/.test(m) ? `<span class="json-key">${m}</span>` : `<span class="json-string">${m}</span>`;
      if (/true|false/.test(m)) return `<span class="json-boolean">${m}</span>`;
      if (/null/.test(m)) return `<span class="json-null">${m}</span>`;
      return `<span class="json-number">${m}</span>`;
    }
  );
}

function formatXML(xml) {
  let formatted = "";
  const reg = /(>)(<)(\/*)/g;
  xml = xml.replace(reg, "$1\r\n$2$3");
  let pad = 0;
  xml.split("\r\n").forEach((node) => {
    let indent = 0;
    if (node.match(/.+<\/\w[^>]*>$/)) indent = 0;
    else if (node.match(/^<\/\w/)) { if (pad !== 0) pad--; }
    else if (node.match(/^<\w[^>]*[^/]>.*$/)) indent = 1;
    formatted += "  ".repeat(pad) + node + "\r\n";
    pad += indent;
  });
  formatted = formatted.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  formatted = formatted.replace(/(&lt;\/?)([\w\-]+)/g, '$1<span class="xml-tag">$2</span>');
  return formatted;
}

// ============================
// HELPERS
// ============================
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function persist() {
  if (!storageReady) {
    window.alert("Collections cannot be saved because loading the storage failed.");
    return Promise.resolve(false);
  }
  const snapshot = JSON.parse(JSON.stringify(collections));
  saveQueue = saveQueue.then(() => SaveCollections(snapshot)).then(() => true).catch((error) => {
    console.error("Failed to save collections", error);
    window.alert("Failed to save collections: " + error);
    return false;
  });
  return saveQueue;
}

// ============================
// COLLECTION TREE RENDER
// ============================
function renderTree(query = "") {
  const q = query.toLowerCase().trim();
  collectionTree.innerHTML = "";

  if (collections.length === 0) {
    collectionTree.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <p>No collections yet.<br/>Click <strong>+</strong> to create one.</p>
      </div>`;
    return;
  }

  collections.forEach((col) => {
    if (!Array.isArray(col.requests)) col.requests = [];

    const filteredReqs = q
      ? col.requests.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q) || r.method.toLowerCase().includes(q))
      : col.requests;

    if (q && filteredReqs.length === 0) return;

    const colEl = document.createElement("div");
    colEl.className = "collection-item";
    colEl.dataset.colId = col.id;

    const isOpen = q || col._open;

    colEl.innerHTML = `
      <div class="collection-header" data-col-id="${escHtml(col.id)}">
        <span class="col-chevron ${isOpen ? "open" : ""}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        <span class="col-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="col-name" title="${escHtml(col.name)}">${escHtml(col.name)}</span>
        <span class="col-count">${col.requests.length}</span>
        <div class="col-actions">
          <button class="col-action-btn add-req-btn" title="Add Request" data-col-id="${escHtml(col.id)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="col-action-btn danger del-col-btn" title="Delete Collection" data-col-id="${escHtml(col.id)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="collection-requests ${isOpen ? "open" : ""}"></div>
    `;

    // Build requests list
    const reqContainer = colEl.querySelector(".collection-requests");
    filteredReqs.forEach((req) => {
      const reqEl = document.createElement("div");
      reqEl.className = "request-item" + (req.id === activeRequestId ? " active" : "");
      reqEl.dataset.reqId = req.id;
      reqEl.dataset.colId = col.id;
      reqEl.innerHTML = `
        <span class="method-badge ${escHtml(req.method)}">${escHtml(req.method)}</span>
        <span class="req-name" title="${escHtml(req.url)}">${escHtml(req.name) || escHtml(req.url) || "Untitled"}</span>
        <button class="req-del-btn" title="Delete request" data-req-id="${escHtml(req.id)}" data-col-id="${escHtml(col.id)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      reqEl.addEventListener("click", (e) => {
        if (e.target.closest(".req-del-btn")) return;
        loadRequest(req, col.id);
      });

      reqEl.querySelector(".req-del-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRequest(col.id, req.id);
      });

      reqContainer.appendChild(reqEl);
    });

    // Toggle collapse
    const header = colEl.querySelector(".collection-header");
    header.addEventListener("click", (e) => {
      if (e.target.closest(".col-actions")) return;
      const idx = collections.findIndex((c) => c.id === col.id);
      if (idx !== -1) collections[idx]._open = !collections[idx]._open;
      renderTree(searchInput.value);
    });

    // Add request to collection
    colEl.querySelector(".add-req-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      addRequestToCollection(col.id);
    });

    // Delete collection
    colEl.querySelector(".del-col-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCollection(col.id);
    });

    collectionTree.appendChild(colEl);
  });
}

// ============================
// LOAD REQUEST INTO EDITOR
// ============================
function loadRequest(req, colId) {
  activeRequestId = req.id;
  activeCollectionId = colId;
  reqNameInput.value = req.name || "";
  methodSelect.value = req.method || "GET";
  urlInput.value = req.url || "";
  timeoutInput.value = req.timeout_seconds || 30;
  timeoutInput.setCustomValidity("");
  syncParamsFromUrl();
  reqBody.value = req.body || "";
  const contentType = Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.toLowerCase() || "";
  bodyTypeSelect.value = !req.body ? "none" : contentType.includes("urlencoded") ? "form" : contentType.includes("json") || looksLikeJsonBody(req.body) ? "json" : "text";
  bodyTypeSelect.dispatchEvent(new window.Event("change"));

  // Separate auth headers from custom headers
  const authHeader = req.headers?.["Authorization"] || "";
  const customHeaders = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k !== "Authorization") customHeaders[k] = v;
  }

  setKvRows("headersRows", customHeaders);

  // Set auth
  if (authHeader.startsWith("Bearer ")) {
    authTypeSelect.value = "bearer";
    renderAuthFields();
    const tokenEl = document.getElementById("authBearerToken");
    if (tokenEl) tokenEl.value = authHeader.substring(7);
  } else if (authHeader.startsWith("Basic ")) {
    authTypeSelect.value = "basic";
    renderAuthFields();
    try {
      const binary = atob(authHeader.substring(6));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const credentials = new TextDecoder().decode(bytes);
      const separator = credentials.indexOf(":");
      document.getElementById("authBasicUser").value = separator < 0 ? credentials : credentials.slice(0, separator);
      document.getElementById("authBasicPass").value = separator < 0 ? "" : credentials.slice(separator + 1);
    } catch (_) {}
  } else {
    authTypeSelect.value = "none";
    renderAuthFields();
  }

  renderTree(searchInput.value);
}

// ============================
// SEARCH
// ============================
searchInput.addEventListener("input", () => renderTree(searchInput.value));

// ============================
// NEW COLLECTION MODAL
// ============================
newCollectionBtn.addEventListener("click", () => openCollectionModal());

importCollectionBtn.addEventListener("click", () => {
  if (!storageReady) {
    importStatus.textContent = "Collections cannot be imported until storage loads successfully.";
    importStatus.classList.add("error");
    return;
  }
  importCollectionFile.click();
});

importCollectionFile.addEventListener("change", async () => {
  const file = importCollectionFile.files?.[0];
  if (!file) return;
  importCollectionBtn.disabled = true;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("Collection file exceeds the 10 MB limit.");
    const { collection, report } = parsePostmanCollection(await file.text(), uid);
    const originalName = collection.name;
    let suffix = 2;
    while (collections.some((existing) => existing.name.toLowerCase() === collection.name.toLowerCase())) {
      collection.name = `${originalName} (${suffix++})`;
    }
    collection._open = true;
    collections.push(collection);
    searchInput.value = "";
    renderTree();
    if (!await persist()) {
      collections = collections.filter((existing) => existing.id !== collection.id);
      renderTree();
      throw new Error("Collection could not be saved.");
    }

    const notes = [];
    if (report.unresolvedVariables.length) notes.push(`Fill unresolved variables: ${report.unresolvedVariables.join(", ")}.`);
    if (report.skippedRequests) notes.push(`${report.skippedRequests} unsupported request(s) skipped.`);
    if (report.unsupportedBodies) notes.push(`${report.unsupportedBodies} unsupported body type(s) need review.`);
    if (report.unsupportedAuth.length) notes.push(`Unsupported auth: ${report.unsupportedAuth.join(", ")}.`);
    if (report.ignoredScripts) notes.push(`${report.ignoredScripts} Postman script(s) were not imported.`);
    if (report.ignoredResponses) notes.push(`${report.ignoredResponses} saved response(s) were not imported.`);
    importStatus.textContent = `Imported ${collection.requests.length} request(s) into "${collection.name}". ${notes.join(" ")}`.trim();
    importStatus.classList.remove("error");
  } catch (error) {
    importStatus.textContent = "Import failed: " + error.message;
    importStatus.classList.add("error");
  } finally {
    importCollectionFile.value = "";
    importCollectionBtn.disabled = false;
  }
});

function showCollectionError(msg) {
  const errEl = document.getElementById("collectionNameError");
  if (errEl) errEl.textContent = msg || "";
}

function openCollectionModal(editId = null) {
  showCollectionError("");
  collectionModal.classList.add("open");
  collectionNameInput.value = editId
    ? collections.find((c) => c.id === editId)?.name || ""
    : "";
  modalTitle.textContent = editId ? "Rename Collection" : "New Collection";
  collectionNameInput.focus();
  confirmModal.dataset.editId = editId || "";
}

function closeCollectionModal() {
  pendingReopenSave = false;
  collectionModal.classList.remove("open");
  collectionNameInput.value = "";
}

closeModal.addEventListener("click", closeCollectionModal);
cancelModal.addEventListener("click", closeCollectionModal);
collectionModal.addEventListener("click", (e) => { if (e.target === collectionModal) closeCollectionModal(); });

collectionNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmModal.click(); });
collectionNameInput.addEventListener("input", () => showCollectionError(""));

confirmModal.addEventListener("click", () => {
  const raw = collectionNameInput.value;
  const name = raw.trim();
  const editId = confirmModal.dataset.editId;

  if (!raw) {
    showCollectionError("Collection name is required.");
    return;
  }
  const duplicate = collections.find((c) => c.id !== editId && c.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showCollectionError("A collection with this name already exists.");
    return;
  }

  let newColId = null;
  if (editId) {
    const idx = collections.findIndex((c) => c.id === editId);
    if (idx !== -1) collections[idx].name = name;
  } else {
    const col = { id: uid(), name, requests: [], _open: true };
    collections.push(col);
    newColId = col.id;
  }

  const reopen = pendingReopenSave;
  pendingReopenSave = false;
  persist();
  renderTree(searchInput.value);
  closeCollectionModal();
  if (reopen) {
    setTimeout(() => {
      openSaveRequestModal();
      if (newColId) saveToCollection.value = newColId;
    }, 50);
  }
});

// ============================
// SAVE REQUEST MODAL
// ============================
saveRequestBtn.addEventListener("click", openSaveRequestModal);

function openSaveRequestModal() {
  if (getTimeoutSeconds() === null) return;
  saveRequestModal.classList.add("open");
  saveReqNameInput.value = reqNameInput.value || buildDefaultName();
  populateSaveCollectionSelect();
  if (activeCollectionId) saveToCollection.value = activeCollectionId;
  saveReqNameInput.focus();
}

function buildDefaultName() {
  return `${methodSelect.value} ${urlInput.value.split("/").pop() || "Request"}`.trim();
}

function populateSaveCollectionSelect() {
  saveToCollection.innerHTML = "";
  if (collections.length === 0) {
    saveToCollection.innerHTML = `<option value="">— No collections —</option>`;
    return;
  }
  collections.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = col.id;
    opt.textContent = col.name;
    saveToCollection.appendChild(opt);
  });
}

function closeSaveRequestModal() {
  saveRequestModal.classList.remove("open");
}

closeSaveModal.addEventListener("click", closeSaveRequestModal);
cancelSaveModal.addEventListener("click", closeSaveRequestModal);
saveRequestModal.addEventListener("click", (e) => { if (e.target === saveRequestModal) closeSaveRequestModal(); });

createNewColFromSave.addEventListener("click", () => {
  closeSaveRequestModal();
  pendingReopenSave = true;
  openCollectionModal();
});

confirmSaveModal.addEventListener("click", () => {
  const timeoutSeconds = getTimeoutSeconds();
  if (timeoutSeconds === null) return;
  const name = saveReqNameInput.value.trim() || buildDefaultName();
  const colId = saveToCollection.value;
  try {
    if (!colId) {
      const col = { id: uid(), name: "My Collection", requests: [], _open: true };
      collections.push(col);
      saveRequestTo(col.id, name, timeoutSeconds);
    } else {
      saveRequestTo(colId, name, timeoutSeconds);
    }
  } finally {
    closeSaveRequestModal();
  }
});

function saveRequestTo(colId, name, timeoutSeconds) {
  const col = collections.find((c) => c.id === colId);
  if (!col) return;
  if (!Array.isArray(col.requests)) col.requests = [];

  const headersFromKv = getKvMap("headersRows");
  const authHeaders = getAuthHeaders();
  const allHeaders = mergeHeaders(headersFromKv, authHeaders);
  setDefaultContentType(allHeaders, bodyTypeSelect.value, reqBody.value);

  const sourceCol = collections.find((c) => c.id === activeCollectionId);
  const existing = sourceCol?.requests.find((request) => request.id === activeRequestId);
  const newReq = {
    id: existing?.id || uid(),
    name,
    method: methodSelect.value,
    url: buildUrlWithParams(),
    headers: allHeaders,
    body: bodyTypeSelect.value !== "none" ? reqBody.value : "",
    timeout_seconds: timeoutSeconds,
  };

  if (existing) {
    sourceCol.requests = sourceCol.requests.filter((request) => request.id !== existing.id);
  }
  col.requests.push(newReq);
  col._open = true;
  activeRequestId = newReq.id;
  activeCollectionId = col.id;
  reqNameInput.value = name;

  persist();
  renderTree(searchInput.value);
}

// ============================
// ADD REQUEST (from + button)
// ============================
function addRequestToCollection(colId) {
  const col = collections.find((c) => c.id === colId);
  if (!col) return;
  const req = {
    id: uid(),
    name: "New Request",
    method: "GET",
    url: "",
    headers: {},
    body: "",
    timeout_seconds: 30,
  };
  col.requests.push(req);
  col._open = true;
  persist();
  renderTree(searchInput.value);
  loadRequest(req, colId);
}

// ============================
// DELETE
// ============================
function deleteCollection(colId) {
  collections = collections.filter((c) => c.id !== colId);
  if (collections.find((c) => c.requests.some((r) => r.id === activeRequestId)) === undefined) {
    activeRequestId = null;
    activeCollectionId = null;
  }
  persist();
  renderTree(searchInput.value);
}

function deleteRequest(colId, reqId) {
  const col = collections.find((c) => c.id === colId);
  if (!col) return;
  col.requests = col.requests.filter((r) => r.id !== reqId);
  if (activeRequestId === reqId) {
    activeRequestId = null;
    activeCollectionId = null;
  }
  persist();
  renderTree(searchInput.value);
}

// ============================
// CONTEXT MENU (collection right-click)
// ============================
document.addEventListener("contextmenu", (e) => {
  const header = e.target.closest(".collection-header");
  if (!header) return;
  e.preventDefault();
  activeCollectionContext = header.dataset.colId;
  const hasAddReq = true; // always show on collection
  ctxAddRequest.style.display = hasAddReq ? "" : "none";
  contextMenu.style.left = e.clientX + "px";
  contextMenu.style.top = e.clientY + "px";
  contextMenu.classList.add("open");
});

document.addEventListener("click", () => contextMenu.classList.remove("open"));

ctxRename.addEventListener("click", () => {
  if (activeCollectionContext) openCollectionModal(activeCollectionContext);
  contextMenu.classList.remove("open");
});

ctxAddRequest.addEventListener("click", () => {
  if (activeCollectionContext) addRequestToCollection(activeCollectionContext);
  contextMenu.classList.remove("open");
});

ctxDelete.addEventListener("click", () => {
  if (activeCollectionContext) deleteCollection(activeCollectionContext);
  contextMenu.classList.remove("open");
});

// Spin animation for loading
const style = document.createElement("style");
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
