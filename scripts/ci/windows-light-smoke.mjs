import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const [source, out] = process.argv.slice(2);
fs.mkdirSync(out, {recursive:true});
const require = createRequire(path.join(source, 'apps/desktop/package.json'));
const { _electron: electron } = require('@playwright/test');
const release = path.join(source, 'apps/desktop/release');
const dir = fs.readdirSync(release).find(n => n.includes('unpacked') && fs.statSync(path.join(release,n)).isDirectory());
if (!dir) throw Error('No unpacked application');
const root = path.join(release, dir);
const names = [];
function walk(p) { for (const entry of fs.readdirSync(p,{withFileTypes:true})) { const q = path.join(p,entry.name); names.push(path.relative(root,q)); if(entry.isDirectory()) walk(q); } }
walk(root);
const forbidden = names.filter(n => /(^|[\\/])(agent-payload|python(?:\.exe)?|uv\.exe|hermes_cli|\.venv)([\\/]|$)/i.test(n));
if (forbidden.length) throw Error('Unexpected agent runtime: '+forbidden.join(', '));
fs.writeFileSync(path.join(out,'package-files.txt'),names.join('\n'));
const exe = fs.readdirSync(root).find(n => /hermes.*\.exe$/i.test(n));
if (!exe) throw Error('Missing Hermes exe');
const env = {...process.env, HERMES_HOME:path.join(out,'test-home')};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({executablePath:path.join(root,exe), args:['--user-data-dir='+path.join(out,'test-user-data'), '--disable-gpu'], env, timeout:90000});
try {
 const page = await app.firstWindow({timeout:60000});
 await page.waitForLoadState('domcontentloaded');
 await page.waitForFunction(() => document.body.innerText.trim().length > 30, {timeout:60000});
 await page.waitForTimeout(5000);
 const text = await page.locator('body').innerText();
 await page.screenshot({path:path.join(out,'windows-launch.png')});
 fs.writeFileSync(path.join(out,'launch-text.txt'),text);
 if (!/remote|connect|gateway/i.test(text)) throw Error('Remote connection UI not visible: '+text);
 const report = {source:'b247d791662e67e5f1215eef1fde3798261761d5',variant:'light',platform:process.platform,executable:exe,forbiddenPayloadEntries:forbidden,windowTitle:await page.title(),remoteUiVisible:true,scope:'Packaged executable launch only; no authenticated gateway/chat or MSIX installation tested'};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally { await app.close(); }
// Do not upload test user state, even though this run uses no credentials.
for (const name of ['test-home','test-user-data']) fs.rmSync(path.join(out,name),{recursive:true,force:true});
