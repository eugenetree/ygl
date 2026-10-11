// Claude Design exports are self-extracting: the markup and assets sit gzipped
// and base64-encoded in <script type="__bundler/..."> tags. Usage:
//   node unpack.mjs desktop.html <out-dir>
// writes template.html (the markup, with assets referenced by uuid) and one
// file per asset; the design's mock logic is the ~10 KB application/javascript.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [, , src, out] = process.argv;
const lines = fs.readFileSync(src, "utf8").split("\n");
const grab = (type) => {
  const i = lines.findIndex((l) => l.trim() === `<script type="__bundler/${type}">`);
  return i < 0 ? undefined : JSON.parse(lines[i + 1]);
};
const manifest = grab("manifest");
const template = grab("template");
const pageOrder = grab("page_order") ?? [];
const ext = grab("ext_resources") ?? [];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "template.html"), String(template));
const index = [];
for (const [uuid, e] of Object.entries(manifest)) {
  let buf = Buffer.from(e.data, "base64");
  if (e.compressed) buf = zlib.gunzipSync(buf);
  const sub = (e.mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "_");
  const name = `${uuid}.${pageOrder.includes(uuid) ? "page.html" : sub}`;
  fs.writeFileSync(path.join(out, name), buf);
  index.push({ uuid, mime: e.mime, bytes: buf.length, page: pageOrder.includes(uuid), name });
}
console.log(JSON.stringify({ templateType: typeof template, pageOrder, index, ext }, null, 2));
