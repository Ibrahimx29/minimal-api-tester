const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function entryValue(entries, key) {
  return Array.isArray(entries) ? entries.find((entry) => entry?.key === key && !entry.disabled)?.value : undefined;
}

function setHeader(headers, key, value) {
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === key.toLowerCase()) delete headers[existing];
  }
  headers[key] = value;
}

function hasHeader(headers, key) {
  return Object.keys(headers).some((existing) => existing.toLowerCase() === key.toLowerCase());
}

function urlFromPostman(value, resolve) {
  if (typeof value === "string") return resolve(value);
  if (!isObject(value)) return "";

  let raw = typeof value.raw === "string" ? value.raw : "";
  const synthesized = !raw;
  if (!raw) {
    const host = Array.isArray(value.host) ? value.host.join(".") : String(value.host || "");
    const path = Array.isArray(value.path)
      ? value.path.map((part) => typeof part === "string" ? part : part?.value || "").join("/")
      : String(value.path || "");
    if (!host) return "";
    raw = `${value.protocol || "https"}://${host}${value.port ? `:${value.port}` : ""}${path ? "/" + path : ""}`;
  }

  // Postman can keep disabled query entries in `raw`; exclude them when present.
  if (Array.isArray(value.query) && (synthesized || value.query.some((entry) => entry?.disabled))) {
    const base = resolve(raw.split("#")[0].split("?")[0]);
    const query = new URLSearchParams();
    for (const entry of value.query) {
      if (entry?.disabled || !entry?.key) continue;
      query.append(resolve(String(entry.key)), resolve(String(entry.value ?? "")));
    }
    const encodedQuery = query.toString();
    raw = base + (encodedQuery ? "?" + encodedQuery : "");
  }
  return resolve(raw);
}

function addQueryParam(url, key, value) {
  const [base, fragment] = url.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  return base + separator + new URLSearchParams([[key, value]]).toString() + (fragment === undefined ? "" : "#" + fragment);
}

export function parsePostmanCollection(json, makeId = () => crypto.randomUUID()) {
  let source;
  try {
    source = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!isObject(source) || !isObject(source.info) || !Array.isArray(source.item)) {
    throw new Error("File is not a Postman collection (expected info and item fields).");
  }

  const variables = new Map();
  for (const variable of Array.isArray(source.variable) ? source.variable : []) {
    if (variable?.key && !variable.disabled && variable.value !== undefined && variable.value !== null) {
      variables.set(String(variable.key), String(variable.value));
    }
  }
  const unresolvedVariables = new Set();
  const resolve = (input) => {
    let result = String(input ?? "");
    for (let pass = 0; pass < 5; pass++) {
      const next = result.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) => {
        const variableName = key.trim();
        const value = variables.get(variableName);
        if (!value) {
          unresolvedVariables.add(variableName);
          return match;
        }
        return value;
      });
      if (next === result) break;
      result = next;
    }
    for (const match of result.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) unresolvedVariables.add(match[1].trim());
    return result;
  };

  const collection = {
    id: makeId(),
    name: String(source.info.name || "Imported Collection").trim() || "Imported Collection",
    requests: [],
  };
  const report = {
    unresolvedVariables: [],
    skippedRequests: 0,
    unsupportedBodies: 0,
    unsupportedAuth: new Set(),
    ignoredScripts: Array.isArray(source.event) ? source.event.length : 0,
    ignoredResponses: 0,
  };

  const walk = (items, folderPath, inheritedAuth) => {
    for (const item of items) {
      if (!isObject(item)) {
        report.skippedRequests++;
        continue;
      }
      const itemName = String(item.name || "").trim();
      if (Array.isArray(item.item)) {
        report.ignoredScripts += Array.isArray(item.event) ? item.event.length : 0;
        walk(item.item, itemName ? [...folderPath, itemName] : folderPath, item.auth ?? inheritedAuth);
        continue;
      }

      const request = typeof item.request === "string" ? { method: "GET", url: item.request } : item.request;
      if (!isObject(request)) {
        report.skippedRequests++;
        continue;
      }
      const method = String(request.method || "GET").toUpperCase();
      let url = urlFromPostman(request.url, resolve);
      if (!METHODS.has(method) || !url) {
        report.skippedRequests++;
        continue;
      }

      const headers = {};
      for (const header of Array.isArray(request.header) ? request.header : []) {
        if (!header?.key || header.disabled) continue;
        setHeader(headers, resolve(String(header.key)), resolve(String(header.value ?? "")));
      }

      let body = "";
      const bodySource = request.body;
      if (isObject(bodySource)) {
        if (bodySource.mode === "raw") {
          body = resolve(String(bodySource.raw ?? ""));
          const language = bodySource.options?.raw?.language;
          const jsonHeader = Object.entries(headers).some(([key, value]) => key.toLowerCase() === "content-type" && value.toLowerCase().includes("json"));
          if (body && language === "json" && !jsonHeader && !hasHeader(headers, "Content-Type")) {
            setHeader(headers, "Content-Type", "application/json");
          }
        } else if (bodySource.mode === "urlencoded") {
          const params = new URLSearchParams();
          for (const entry of Array.isArray(bodySource.urlencoded) ? bodySource.urlencoded : []) {
            if (!entry?.key || entry.disabled) continue;
            params.append(resolve(String(entry.key)), resolve(String(entry.value ?? "")));
          }
          body = params.toString();
          if (body && !hasHeader(headers, "Content-Type")) setHeader(headers, "Content-Type", "application/x-www-form-urlencoded");
        } else if (bodySource.mode && bodySource.mode !== "none") {
          report.unsupportedBodies++;
        }
      }

      const auth = request.auth ?? inheritedAuth;
      if (isObject(auth) && auth.type && auth.type !== "noauth") {
        if (auth.type === "bearer") {
          const token = resolve(entryValue(auth.bearer, "token"));
          if (token && !hasHeader(headers, "Authorization")) setHeader(headers, "Authorization", "Bearer " + token);
        } else if (auth.type === "basic") {
          const username = resolve(entryValue(auth.basic, "username"));
          const password = resolve(entryValue(auth.basic, "password"));
          if (username && !hasHeader(headers, "Authorization")) {
            const bytes = new TextEncoder().encode(username + ":" + password);
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            setHeader(headers, "Authorization", "Basic " + btoa(binary));
          }
        } else if (auth.type === "apikey") {
          const key = resolve(entryValue(auth.apikey, "key"));
          const value = resolve(entryValue(auth.apikey, "value"));
          const location = entryValue(auth.apikey, "in");
          if (key && location === "query") url = addQueryParam(url, key, value);
          else if (key) setHeader(headers, key, value);
        } else {
          report.unsupportedAuth.add(auth.type);
        }
      }

      report.ignoredScripts += Array.isArray(item.event) ? item.event.length : 0;
      report.ignoredResponses += Array.isArray(item.response) ? item.response.length : 0;
      collection.requests.push({
        id: makeId(),
        name: [...folderPath, itemName || `${method} ${url}`].join(" / "),
        method,
        url,
        headers,
        body,
      });
    }
  };

  walk(source.item, [], source.auth);
  if (!collection.requests.length) throw new Error("No supported requests were found in this collection.");
  report.unresolvedVariables = [...unresolvedVariables];
  report.unsupportedAuth = [...report.unsupportedAuth];
  return { collection, report };
}
