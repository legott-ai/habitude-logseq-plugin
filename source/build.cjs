'use strict';
/* global __dirname, __filename */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { Buffer } = require('node:buffer');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const build = process.env.HABITUDE_PLUGIN_BUILD_DIR || path.join(os.tmpdir(), 'habitude-note-plugins-' + crypto.createHash('sha256').update(root).digest('hex').slice(0, 12));
const dist = path.join(root, 'dist');
const SDK_VERSION = '0.3.4';
const SDK_COMMIT = '3de7c75154b628dadfdb53dae6253c8bf5e2ab1b';
const SDK_URL = `https://registry.npmjs.org/@logseq/libs/-/libs-${SDK_VERSION}.tgz`;
const SDK_INTEGRITY = '/68j0j8Ps7PgEuKsWQhUoiLoineTQNH/DHTBQ07NX8M31rqSpWuZaI6fFhfWv46qLIK0Q9Gz+SKQf6XMQ9ADag==';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function download(url, maxBytes = 2 * 1024 * 1024) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('UPSTREAM_DOWNLOAD_FAILED');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) throw new Error('UPSTREAM_DOWNLOAD_TOO_LARGE');
  return data;
}
async function sdkPreferredSource(destination) {
  const cached = path.join(build, 'sdk-source');
  const marker = path.join(cached, 'verified-commit.txt');
  let ready = false;
  try { ready = (await fs.readFile(marker, 'utf8')).trim() === SDK_COMMIT; } catch { /* First build downloads public source only. */ }
  if (!ready) {
    const tree = async id => JSON.parse((await download(`https://api.github.com/repos/logseq/logseq/git/trees/${id}`, 1000000)).toString());
    const top = await tree(SDK_COMMIT), libs = top.tree.find(entry => entry.path === 'libs' && entry.type === 'tree');
    if (!libs) throw new Error('SDK_SOURCE_UNAVAILABLE');
    const children = await tree(libs.sha), source = children.tree.find(entry => entry.path === 'src' && entry.type === 'tree');
    if (!source) throw new Error('SDK_SOURCE_UNAVAILABLE');
    const listing = JSON.parse((await download(`https://api.github.com/repos/logseq/logseq/git/trees/${source.sha}?recursive=1`, 1000000)).toString());
    if (listing.truncated) throw new Error('SDK_SOURCE_TRUNCATED');
    const files = listing.tree.filter(entry => entry.type === 'blob');
    if (files.length > 100 || files.some(entry => !/^[A-Za-z0-9_./-]+$/.test(entry.path) || entry.path.split('/').includes('..') || entry.size > 1000000)) throw new Error('SDK_SOURCE_LIMIT');
    await fs.mkdir(cached, { recursive: true });
    for (let index = 0; index < files.length; index += 5) await Promise.all(files.slice(index, index + 5).map(async entry => {
      const data = await download(`https://raw.githubusercontent.com/logseq/logseq/${SDK_COMMIT}/libs/src/${entry.path}`, 1000000);
      const target = path.join(cached, 'src', entry.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data);
    }));
    await fs.writeFile(path.join(cached, 'package.json'), await download(`https://raw.githubusercontent.com/logseq/logseq/${SDK_COMMIT}/libs/package.json`, 100000));
    await fs.writeFile(marker, SDK_COMMIT + '\n');
  }
  await fs.cp(cached, destination, { recursive: true });
}
function moduleClosure(source) { return `(()=>{const module={exports:{}};const exports=module.exports;\n${source}\nreturn module.exports;})()`; }
async function main() {
  await fs.mkdir(dist, { recursive: true }); await fs.mkdir(build, { recursive: true });
  const portable = await fs.readFile(path.join(root, 'portable.cjs'), 'utf8');
  const joplin = await fs.readFile(path.join(root, 'joplin/index.cjs'), 'utf8');
  const logseq = await fs.readFile(path.join(root, 'logseq/index.cjs'), 'utf8');
  const stage = await fs.mkdtemp(path.join(build, 'stage-'));
  const joplinDir = path.join(stage, 'joplin'), logseqDir = path.join(stage, 'logseq');
  await fs.mkdir(joplinDir, { recursive: true }); await fs.mkdir(path.join(logseqDir, 'vendor'), { recursive: true });
  await fs.writeFile(path.join(joplinDir, 'index.js'), `// Habitude local export plugin. No source-note writes or automated network calls.\n(()=>{const portable=${moduleClosure(portable)};const {registerJoplin}=${moduleClosure(joplin)};registerJoplin(joplin,portable);})();\n`);
  await fs.writeFile(path.join(logseqDir, 'index.js'), `// Habitude local export plugin. Runtime SDK is shipped locally.\n(()=>{const portable=${moduleClosure(portable)};const {registerLogseq}=${moduleClosure(logseq)};logseq.ready(()=>registerLogseq(logseq,portable,document,window)).catch(()=>{const status=document.getElementById('status');if(status)status.textContent='플러그인을 시작하지 못했습니다. / Could not start the plugin.';});})();\n`);
  for (const [source, target] of [['joplin/manifest.json', 'manifest.json'], ['joplin/package.json', 'package.json'], ['joplin/LICENSE', 'LICENSE'], ['joplin/README.md', 'README.md']]) await fs.copyFile(path.join(root, source), path.join(joplinDir, target));
  for (const name of ['package.json', 'index.html', 'README.md']) await fs.copyFile(path.join(root, 'logseq', name), path.join(logseqDir, name));
  const sdkArchive = path.join(build, `logseq-libs-${SDK_VERSION}.tgz`);
  let sdk;
  try { sdk = await fs.readFile(sdkArchive); } catch { sdk = await download(SDK_URL); }
  if (crypto.createHash('sha512').update(sdk).digest('base64') !== SDK_INTEGRITY) throw new Error('SDK_INTEGRITY_MISMATCH');
  await fs.writeFile(sdkArchive, sdk);
  // Read only the exact archive members needed at runtime; never extract paths supplied by a tar.
  execFileSync('python3', ['-c', 'import tarfile,pathlib,sys\na=tarfile.open(sys.argv[1]);o=pathlib.Path(sys.argv[2])\nfor n in ["lsplugin.user.js","lsplugin.user.js.LICENSE.txt"]:\n m=a.getmember("package/dist/"+n);assert m.isfile() and m.size<200000\n (o/n).write_bytes(a.extractfile(m).read())', sdkArchive, path.join(logseqDir, 'vendor')]);
  const licenseURL = `https://raw.githubusercontent.com/logseq/logseq/${SDK_COMMIT}/LICENSE.md`;
  let license;
  try { license = await fs.readFile(path.join(build, 'logseq-AGPL-LICENSE.md')); } catch { license = await download(licenseURL, 100000); }
  if (!license.toString().trimStart().startsWith('GNU AFFERO GENERAL PUBLIC LICENSE')) throw new Error('UPSTREAM_LICENSE_UNAVAILABLE');
  await fs.writeFile(path.join(build, 'logseq-AGPL-LICENSE.md'), license);
  await fs.writeFile(path.join(logseqDir, 'LICENSE'), license);
  let purifierLicense;
  try { purifierLicense = await fs.readFile(path.join(build, 'dompurify-LICENSE.txt')); } catch { purifierLicense = await download('https://raw.githubusercontent.com/cure53/DOMPurify/3.3.3/LICENSE', 100000); }
  if (!purifierLicense.toString().startsWith('DOMPurify')) throw new Error('DEPENDENCY_LICENSE_UNAVAILABLE');
  await fs.writeFile(path.join(build, 'dompurify-LICENSE.txt'), purifierLicense);
  await fs.writeFile(path.join(logseqDir, 'vendor/DOMPurify-LICENSE.txt'), purifierLicense);
  await fs.writeFile(path.join(logseqDir, 'THIRD_PARTY.md'), `# Bundled Logseq SDK\n\nUnmodified @logseq/libs ${SDK_VERSION}, published from logseq/logseq commit ${SDK_COMMIT}.\nPackage: ${SDK_URL}\nIntegrity (SHA-512 base64): ${SDK_INTEGRITY}\nPreferred upstream source: https://github.com/logseq/logseq/tree/${SDK_COMMIT}/libs\nUpstream license: ${licenseURL}\nThe upstream SDK's distribution notice is vendor/lsplugin.user.js.LICENSE.txt.\nThis Logseq distribution is provided under AGPL-3.0-only; authored source is included in source/.\n\nDOMPurify is dual Apache-2.0 / MPL-2.0, as its unmodified bundled notice records. Its source and licenses: https://github.com/cure53/DOMPurify\n`);
  await fs.mkdir(path.join(logseqDir, 'source/logseq'), { recursive: true });
  await fs.writeFile(path.join(logseqDir, 'source/portable.cjs'), portable);
  await fs.writeFile(path.join(logseqDir, 'source/logseq/index.cjs'), logseq);
  for (const name of ['package.json', 'index.html', 'README.md']) await fs.copyFile(path.join(root, 'logseq', name), path.join(logseqDir, 'source/logseq', name));
  await fs.cp(path.join(root, 'joplin'), path.join(logseqDir, 'source/joplin'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(logseqDir, 'source/package.json'));
  await fs.copyFile(__filename, path.join(logseqDir, 'source/build.cjs'));
  await fs.copyFile(path.join(root, 'verify.cjs'), path.join(logseqDir, 'source/verify.cjs'));
  await fs.cp(path.join(root, 'test'), path.join(logseqDir, 'source/test'), { recursive: true });
  await fs.mkdir(path.join(logseqDir, 'source/.build'), { recursive: true });
  await fs.copyFile(sdkArchive, path.join(logseqDir, `source/.build/logseq-libs-${SDK_VERSION}.tgz`));
  await fs.writeFile(path.join(logseqDir, 'source/.build/logseq-AGPL-LICENSE.md'), license);
  await fs.writeFile(path.join(logseqDir, 'source/.build/dompurify-LICENSE.txt'), purifierLicense);
  await sdkPreferredSource(path.join(logseqDir, 'source/.build/sdk-source'));
  const jpl = path.join(dist, 'habitude-joplin-0.1.0.jpl'), zip = path.join(dist, 'habitude-logseq-0.1.0.zip');
  execFileSync('python3', ['-c', 'import tarfile,zipfile,pathlib,sys\nj=pathlib.Path(sys.argv[1]);l=pathlib.Path(sys.argv[2])\nwith tarfile.open(sys.argv[3],"w",format=tarfile.USTAR_FORMAT) as a:\n for p in sorted(j.rglob("*")):\n  if p.is_file():\n   x=a.gettarinfo(str(p),str(p.relative_to(j)));x.uid=x.gid=0;x.uname=x.gname="";x.mtime=0;x.mode=0o644\n   with p.open("rb") as f:a.addfile(x,f)\nwith zipfile.ZipFile(sys.argv[4],"w",zipfile.ZIP_DEFLATED) as a:\n for p in sorted(l.rglob("*")):\n  if p.is_file():\n   x=zipfile.ZipInfo(str(p.relative_to(l)),(2026,1,1,0,0,0));x.external_attr=0o644<<16;x.compress_type=zipfile.ZIP_DEFLATED;a.writestr(x,p.read_bytes())', joplinDir, logseqDir, jpl, zip]);
  const artifacts = [];
  for (const file of [jpl, zip]) { const content = await fs.readFile(file); artifacts.push({ name: path.basename(file), bytes: content.length, sha256: sha(content) }); }
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'joplin/manifest.json'), 'utf8'));
  await fs.writeFile(path.join(dist, 'ai.habitude.export.json'), JSON.stringify({ ...manifest, _publish_hash: `sha256:${artifacts[0].sha256}` }, null, 2) + '\n');
  const report = { version: '0.1.0', artifacts, sdk: { version: SDK_VERSION, commit: SDK_COMMIT, integrity: `sha512-${SDK_INTEGRITY}`, runtimeSHA256: sha(await fs.readFile(path.join(logseqDir, 'vendor/lsplugin.user.js'))) }, actualHostGUIVerified: false, published: false };
  await fs.writeFile(path.join(dist, 'artifacts.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
}
main().catch(() => { process.stderr.write('PLUGIN_BUILD_FAILED\n'); process.exitCode = 1; });
