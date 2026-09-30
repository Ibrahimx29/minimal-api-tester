import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";

test("request editor preserves query, updates saved request, and handles Basic Auth", async () => {
  const window = new Window({ url: "http://localhost/" });
  globalThis.window = window;
  globalThis.document = window.document;

  const store = [{
    id: "c1",
    name: "Example",
    requests: [{ id: "r1", name: "Existing", method: "GET", url: "https://example.com/items?tag=one&tag=two", headers: {}, body: "" }],
  }];
  const sent = [];
  let nextResponse = { status_code: 200, status_text: "200 OK", time_ms: 1, size_bytes: 2, headers: {}, body: "ok" };
  window.go = { main: { App: {
    LoadCollections: async () => structuredClone(store),
    SaveCollections: async (collections) => {
      store.splice(0, store.length, ...structuredClone(collections));
    },
    SendRequest: async (request) => {
      sent.push(structuredClone(request));
      return nextResponse;
    },
  } } };

  window.document.write(await readFile(new URL("../index.html", import.meta.url), "utf8"));
  window.document.close();
  await import("../src/main.js");
  window.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const $ = (selector) => window.document.querySelector(selector);
  $(".request-item").click();
  assert.equal($("#timeoutSeconds").value, "30");
  assert.equal($("#paramsRows").querySelectorAll(".kv-row").length, 2);
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.at(-1).url, "https://example.com/items?tag=one&tag=two");
  assert.equal(sent.at(-1).timeout_seconds, 30);

  $("#timeoutSeconds").value = "90";
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.at(-1).timeout_seconds, 90);

  $("#timeoutSeconds").value = "0";
  const sentCount = sent.length;
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, sentCount);
  $("#timeoutSeconds").value = "90";

  $("#paramsRows").querySelectorAll(".kv-del").forEach((button) => button.click());
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.at(-1).url, "https://example.com/items");

  $("#url").value = "https://example.com/updated?x=1";
  $("#url").dispatchEvent(new window.Event("change"));
  $("#paramsRows .kv-row input:nth-child(2)").value = "2";
  $("#saveRequestBtn").click();
  $("#confirmSaveModal").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store[0].requests.length, 1);
  assert.equal(store[0].requests[0].id, "r1");
  assert.equal(store[0].requests[0].url, "https://example.com/updated?x=2");
  assert.equal(store[0].requests[0].timeout_seconds, 90);

  $("#authType").value = "basic";
  $("#authType").dispatchEvent(new window.Event("change"));
  $("#authBasicUser").value = "user";
  $("#authBasicPass").value = "🔑: secret ";
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(Buffer.from(sent.at(-1).headers.Authorization.slice(6), "base64").toString("utf8"), "user:🔑: secret ");
  $("#saveRequestBtn").click();
  $("#confirmSaveModal").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  $(".request-item").click();
  assert.equal($("#timeoutSeconds").value, "90");
  assert.equal($("#authBasicPass").value, "🔑: secret ");

  nextResponse = { status_code: 204, status_text: "204 No Content", time_ms: 1, size_bytes: 0, headers: {}, body: "" };
  $("#sendBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal($("#respBody").textContent, "");

  $("#newCollectionBtn").click();
  $("#collectionNameInput").value = "Moved";
  $("#confirmModal").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  $("#saveRequestBtn").click();
  $("#saveToCollection").value = store.find((collection) => collection.name === "Moved").id;
  $("#confirmSaveModal").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.find((collection) => collection.id === "c1").requests.length, 0);
  assert.equal(store.find((collection) => collection.name === "Moved").requests[0].id, "r1");

  const importedJson = JSON.stringify({
    info: { name: "Example" },
    item: [{ name: "Health", request: { method: "GET", url: "https://example.com/health" } }],
  });
  Object.defineProperty($("#importCollectionFile"), "files", {
    configurable: true,
    value: [{ size: importedJson.length, text: async () => importedJson }],
  });
  $("#importCollectionFile").dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.find((collection) => collection.name === "Example (2)")?.requests[0].name, "Health");
  assert.match($("#importStatus").textContent, /Imported 1 request/);

  const collectionCount = store.length;
  Object.defineProperty($("#importCollectionFile"), "files", {
    configurable: true,
    value: [{ size: 1, text: async () => "{" }],
  });
  $("#importCollectionFile").dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.length, collectionCount);
  assert.match($("#importStatus").textContent, /Import failed/);
});
