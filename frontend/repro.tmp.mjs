import { Window } from "happy-dom";

const store = [
  { id: "c1", name: "Loaded", requests: null },
];
const w = new Window({ url: "http://localhost/" });

globalThis.window = w;
globalThis.document = w.document;
Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });
globalThis.HTMLElement = w.HTMLElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.Event = w.Event;
globalThis.CustomEvent = w.CustomEvent;
globalThis.getComputedStyle = () => ({});
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

w.window.go = {
  main: {
    App: {
      LoadCollections: async () => JSON.parse(JSON.stringify(store)),
      SaveCollections: async (c) => {
        store.length = 0;
        store.push(...JSON.parse(JSON.stringify(c)));
      },
      SendRequest: async () => ({ status_code: 200, status_text: "200 OK", time_ms: 12, size_bytes: 3, headers: {}, body: "{}" }),
    },
  },
};

const fs = await import("fs");
const html = await fs.promises.readFile("D:/Projects/minimal-api-tester/frontend/index.html", "utf8");
w.document.write(html);
w.document.close();

// manually dispatch DOMContentLoaded after main.js registers listeners
const waisljsStub = { LoadCollections: async () => JSON.parse(JSON.stringify(store)) };
await import("file:///D:/Projects/minimal-api-tester/frontend/src/main.js");
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
await new Promise((r) => setTimeout(r, 50));

const $ = (sel) => document.querySelector(sel);
const results = [];
const check = (name, cond) => results.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
const err = () => document.getElementById("collectionNameError").textContent;

// BUG 1: loaded collection with requests:null must not crash, must appear
check("loaded collection appears", $("#collectionTree").innerHTML.includes("Loaded"));

// Save flow: save modal opens, save closes it, request added to 'Loaded'
$("#url").value = "https://api.example.com/users";
$("#reqName").value = "Get Users";
$("#saveRequestBtn").click();
check("save modal opens", $("#saveRequestModal").classList.contains("open"));
check("save modal lists 'Loaded'", $("#saveToCollection").innerHTML.includes("Loaded"));
$("#confirmSaveModal").click();
await new Promise((r) => setTimeout(r, 20));
check("save modal closes after save", !$("#saveRequestModal").classList.contains("open"));
check("tree contains 'Get Users'", $("#collectionTree").innerHTML.includes("Get Users"));
check("stored Loaded has 1 request", store[0].requests.length === 1);

// BUG 2 (feature): duplicate collection name blocked
$("#newCollectionBtn").click();
check("new-col modal opens", $("#collectionModal").classList.contains("open"));
check("title says New Collection", document.getElementById("modalTitle").textContent === "New Collection");
$("#collectionNameInput").value = "loaded";
$("#confirmModal").click();
check("duplicate blocked (collection count unchanged)", store.length === 1);
check("error message shown", err().includes("already exists"));
check("new-col modal still open", $("#collectionModal").classList.contains("open"));

// whitespace-only name blocked
$("#collectionNameInput").value = "   ";
$("#confirmModal").click();
check("empty name blocked", store.length === 1);
check("empty-name error shown", err().includes("required"));

// valid new collection
$("#collectionNameInput").value = "Beta";
$("#confirmModal").click();
await new Promise((r) => setTimeout(r, 20));
check("collection 'Beta' created", store.length === 2 && $("#collectionTree").innerHTML.includes("Beta"));
check("new-col modal closed", !$("#collectionModal").classList.contains("open"));

// rename: duplicate blocked (via context menu → Rename)
const headerC1 = document.querySelector('.collection-header[data-col-id="c1"]');
headerC1.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
document.getElementById("ctx-rename").click();
check("title says Rename", document.getElementById("modalTitle").textContent === "Rename Collection");
$("#collectionNameInput").value = "Beta";
$("#confirmModal").click();
check("rename to duplicate blocked", store.find((c) => c.id === "c1").name === "Loaded");
// now rename to unique
$("#collectionNameInput").value = "Renamed";
$("#confirmModal").click();
await new Promise((r) => setTimeout(r, 20));
check("rename succeeded", store.find((c) => c.id === "c1").name === "Renamed");

// New-Collection-from-save flow
$("#saveRequestBtn").click();
$("#createNewColFromSave").click();
check("save modal closed when opening new-col", !$("#saveRequestModal").classList.contains("open"));
check("collection modal opened", $("#collectionModal").classList.contains("open"));
$("#collectionNameInput").value = "Gamma";
$("#confirmModal").click();
await new Promise((r) => setTimeout(r, 80));
check("save modal reopens after creating from save", $("#saveRequestModal").classList.contains("open"));
check("save modal preselected 'Gamma'", $("#saveToCollection").value === store.find((c) => c.name === "Gamma").id);
check("tree contains 'Gamma'", $("#collectionTree").innerHTML.includes("Gamma"));
$("#confirmSaveModal").click();
await new Promise((r) => setTimeout(r, 20));
check("save modal closes after save (from-new-col)", !$("#saveRequestModal").classList.contains("open"));

// New-col-from-save then CANCEL should not later reopen save modal
$("#saveRequestBtn").click();
$("#createNewColFromSave").click();
document.getElementById("cancelModal").click();
check("collection modal closed on cancel", !$("#collectionModal").classList.contains("open"));
$("#newCollectionBtn").click();
$("#collectionNameInput").value = "Delta";
$("#confirmModal").click();
await new Promise((r) => setTimeout(r, 60));
check("no spurious save modal reopen after cancel", !$("#saveRequestModal").classList.contains("open"));
check("collection 'Delta' created", store.some((c) => c.name === "Delta"));

console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL"));
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");