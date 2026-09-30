import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parsePostmanCollection } from "../src/collectionImport.js";

test("imports nested Postman requests, variables, query, body, and warnings", () => {
  let nextId = 0;
  const source = {
    info: { name: "Warehouse API" },
    variable: [{ key: "baseUrl", value: "https://example.test" }, { key: "token", value: "" }],
    event: [{ listen: "prerequest" }],
    item: [{
      name: "Orders",
      item: [{
        name: "Create",
        event: [{ listen: "test" }],
        response: [{}],
        request: {
          method: "POST",
          url: { raw: "{{baseUrl}}/orders?keep=1&skip=2", query: [{ key: "keep", value: "1" }, { key: "skip", value: "2", disabled: true }] },
          header: [{ key: "Content-Type", value: "application/json" }, { key: "Authorization", value: "Bearer {{token}}" }],
          body: { mode: "raw", raw: '{"quantity":1}', options: { raw: { language: "json" } } },
        },
      }, {
        name: "Search",
        request: {
          method: "POST",
          url: "{{baseUrl}}/search",
          body: { mode: "urlencoded", urlencoded: [{ key: "term", value: "two words" }] },
        },
      }],
    }],
  };

  const { collection, report } = parsePostmanCollection(JSON.stringify(source), () => `id-${++nextId}`);
  assert.equal(collection.name, "Warehouse API");
  assert.equal(collection.requests.length, 2);
  assert.equal(collection.requests[0].name, "Orders / Create");
  assert.equal(collection.requests[0].url, "https://example.test/orders?keep=1");
  assert.equal(collection.requests[0].headers.Authorization, "Bearer {{token}}");
  assert.equal(collection.requests[0].body, '{"quantity":1}');
  assert.equal(collection.requests[0].headers["Content-Type"], "application/json");
  assert.equal(collection.requests[1].body, "term=two+words");
  assert.equal(collection.requests[1].headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(report.unresolvedVariables, ["token"]);
  assert.equal(report.ignoredScripts, 2);
  assert.equal(report.ignoredResponses, 1);
});

test("rejects invalid or unrelated JSON", () => {
  assert.throws(() => parsePostmanCollection("{"), /not valid JSON/);
  assert.throws(() => parsePostmanCollection('{"name":"Other"}'), /not a Postman collection/);
});

const samplePath = new URL("../../wms_api_collection.json", import.meta.url);
test("imports the supplied WMS example", { skip: !existsSync(samplePath) }, async () => {
  let nextId = 0;
  const { collection, report } = parsePostmanCollection(await readFile(samplePath, "utf8"), () => `sample-${++nextId}`);
  assert.equal(collection.requests.length, 2);
  assert.ok(collection.requests.every((request) => !request.url.includes("{{baseUrl}}")));
  assert.ok(report.unresolvedVariables.includes("token"));
  assert.equal(report.ignoredScripts, 2);
});
