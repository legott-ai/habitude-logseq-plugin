'use strict';
/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = __dirname, dist = path.join(root, 'dist');
const report = JSON.parse(fs.readFileSync(path.join(dist, 'artifacts.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const artifact of report.artifacts) assert.equal(sha(fs.readFileSync(path.join(dist, artifact.name))), artifact.sha256);
const files = JSON.parse(execFileSync('python3', ['-c', 'import tarfile,zipfile,json,pathlib,sys\nj=tarfile.open(sys.argv[1]);z=zipfile.ZipFile(sys.argv[2])\nfor n in j.getmembers():assert n.isfile() and not pathlib.PurePosixPath(n.name).is_absolute() and ".." not in pathlib.PurePosixPath(n.name).parts\nfor n in z.infolist():assert not pathlib.PurePosixPath(n.filename).is_absolute() and ".." not in pathlib.PurePosixPath(n.filename).parts and n.file_size<2000000\nassert len(z.namelist())<150\nprint(json.dumps({"joplin":{n:j.extractfile(n).read().decode() for n in ["manifest.json","package.json","index.js"]},"logseq":{n:z.read(n).decode() for n in ["package.json","index.html","index.js","vendor/lsplugin.user.js","LICENSE","THIRD_PARTY.md"]},"logseqFileCount":len(z.namelist()),"sourceBundled":any(n.startswith("source/.build/sdk-source/src/") for n in z.namelist())}))', path.join(dist, report.artifacts[0].name), path.join(dist, report.artifacts[1].name)], { maxBuffer: 2 * 1024 * 1024 }).toString());
assert.equal(JSON.parse(files.joplin['manifest.json']).id, 'ai.habitude.export');
assert.equal(JSON.parse(files.joplin['package.json']).version, '0.1.0');
assert.equal(JSON.parse(files.logseq['package.json']).main, 'index.html');
assert.equal(sha(files.logseq['vendor/lsplugin.user.js']), report.sdk.runtimeSHA256);
assert.ok(files.logseq['index.html'].includes('src="vendor/lsplugin.user.js"'));
assert.ok(files.logseq.LICENSE.includes('GNU AFFERO GENERAL PUBLIC LICENSE'));
assert.ok(files.sourceBundled);
let joplinScript;
vm.runInNewContext(files.joplin['index.js'], { joplin: { plugins: { register: script => { joplinScript = script; } } }, TextEncoder });
assert.equal(typeof joplinScript.onStart, 'function');
let logseqBootstrap;
vm.runInNewContext(files.logseq['index.js'], { logseq: { ready: callback => { logseqBootstrap = callback; return Promise.resolve(); } }, document: {}, window: {}, TextEncoder });
assert.equal(typeof logseqBootstrap, 'function');
for (const own of [files.joplin['index.js'], files.logseq['index.js']]) {
  assert.ok(!/\bfetch\s*\(|new XMLHttpRequest\s*\(|new WebSocket\s*\(/.test(own));
  assert.ok(!/\.(?:insertBlock|updateBlock|removeBlock|deletePage)\s*\(/.test(own));
}
process.stdout.write(JSON.stringify({ valid: true, artifacts: report.artifacts, correctArchiveFormats: true, sdkRuntimeByteExact: true, preferredSDKSourceBundled: files.sourceBundled, logseqFileCount: files.logseqFileCount, actualPackagedEntrypointsBootInHostHarness: true, actualHostGUIVerified: false }) + '\n');
