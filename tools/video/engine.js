// Filmimismootor: Playwright (Chromium) kaader-kaadrilt, virtuaalne kell, kursor/tiitrid/esiletõst lehe peal kihina.
// Kasutus: node engine.js <stsenaarium.js> <väljund.mp4>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const FPS = 30, W = 1280, H = 720, SCALE = 1.5;
const CLIPS = path.join(__dirname, 'clips');
// stsenaarium võib anda oma lehe (sim: 'optika') ja kõnetekstide faili (clips: 'toolehele_clips.json'); vaikimisi magnetväli
const SCEN = require(path.resolve(process.argv[2]));
const URL = 'file://' + path.resolve(__dirname, '../../' + (SCEN.sim || 'magnetvali') + '/index.html');
const CLIPS_JSON = path.join(__dirname, SCEN.clips || 'magnetvali_clips.json');

function clipDur(id){
  const f = path.join(CLIPS, id + '.wav');
  if (fs.existsSync(f)) return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const t = JSON.parse(fs.readFileSync(CLIPS_JSON, 'utf8'))[id] || '';
  return t.length/14;                     // hinnang, kui klippi veel pole
}

const OVERLAY = `
(() => {
  const st = document.createElement('style');
  st.textContent = \`
  #__ov{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  #__cur{position:absolute;left:0;top:0;width:28px;height:28px;transform:translate(-3px,-2px)}
  #__ring{position:absolute;width:36px;height:36px;border:3px solid #f97316;border-radius:50%;transform:translate(-50%,-50%);opacity:0}
  #__cap{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);max-width:880px;background:rgba(31,41,55,.94);color:#fff;font-size:19px;line-height:1.4;padding:11px 22px;border-radius:10px;text-align:center;opacity:0;transition:opacity .25s}
  #__hl{position:absolute;border:3px solid #f97316;border-radius:8px;box-shadow:0 0 0 4px rgba(249,115,22,.18);opacity:0}
  #__card{position:absolute;inset:0;background:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:0}
  #__card .bar{width:60px;height:5px;border-radius:3px;background:#dc2626;margin-bottom:22px}
  #__card .t{font-size:40px;font-weight:700;color:#1f2937}
  #__card .s{font-size:20px;color:#4b5563;margin-top:12px}
  #__card .u{font-size:18px;color:#2563eb;margin-top:22px;font-family:ui-monospace,Menlo,Consolas,monospace}
  \`;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.id = '__ov';
  ov.innerHTML = '<div id="__hl"></div><div id="__ring"></div><div id="__cap"></div>' +
    '<svg id="__cur" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12 25 L15.5 23.5 L12 15.8 L19.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
    '<div id="__card"><div class="bar"></div><div class="t"></div><div class="s"></div><div class="u"></div></div>';
  document.body.appendChild(ov);
})();`;

const CLOCK = `
(() => {
  let vt = 0; const q = [];
  performance.now = () => vt;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__advance = ms => { vt += ms; const cbs = q.splice(0); for (const cb of cbs) cb(vt); };
})();`;

async function run(scenario, outFile){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport:{width:W, height:H}, deviceScaleFactor:SCALE});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(CLOCK);
  await page.goto(URL);
  await page.evaluate(OVERLAY);
  if (scenario.hideHint !== false) await page.evaluate(() => { const h = document.getElementById('hint'); if (h) h.style.display = 'none'; });

  const tmpV = outFile.replace(/\.mp4$/, '.video.mp4');
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmpV], {stdio:['pipe', 'inherit', 'inherit']});
  let frames = 0;
  const cur = {x:W*0.62, y:H*0.55};
  const audio = [];          // [clipId, algus s]
  const sceneLog = [];

  async function frame(){
    await page.evaluate(([x, y]) => { const c = document.getElementById('__cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; window.__advance(1000/30); }, [cur.x, cur.y]);
    const buf = await page.screenshot({type:'jpeg', quality:88});
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    frames++;
  }
  const now = () => frames/FPS;
  async function wait(sec){ const n = Math.round(sec*FPS); for (let i = 0; i < n; i++) await frame(); }
  const ease = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
  async function moveTo(x, y, sec = 0.6, mouse = true){
    const x0 = cur.x, y0 = cur.y, n = Math.max(1, Math.round(sec*FPS));
    for (let i = 1; i <= n; i++){
      const e = ease(i/n); cur.x = x0 + (x - x0)*e; cur.y = y0 + (y - y0)*e;
      if (mouse) await page.mouse.move(cur.x, cur.y);
      await frame();
    }
  }
  async function elCenter(sel){
    return page.evaluate(sel => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2, r.left, r.top, r.width, r.height]; }, sel);
  }
  async function scrollTo(sel, sec = 0.5){
    const target = await page.evaluate(sel => {
      const a = document.querySelector('aside'), el = document.querySelector(sel), r = el.getBoundingClientRect();
      if (r.top > 70 && r.bottom < innerHeight - 140) return null;
      return Math.max(0, Math.min(a.scrollHeight - a.clientHeight, a.scrollTop + r.top - innerHeight*0.35));
    }, sel);
    if (target === null) return;
    const s0 = await page.evaluate(() => document.querySelector('aside').scrollTop), n = Math.round(sec*FPS);
    for (let i = 1; i <= n; i++){ await page.evaluate(v => { document.querySelector('aside').scrollTop = v; }, s0 + (target - s0)*ease(i/n)); await frame(); }
  }
  async function highlight(sel, on){
    await page.evaluate(([sel, on]) => {
      const h = document.getElementById('__hl');
      if (!on){ h.style.opacity = 0; return; }
      const r = document.querySelector(sel).getBoundingClientRect();
      Object.assign(h.style, {left:(r.left - 5) + 'px', top:(r.top - 5) + 'px', width:(r.width + 10) + 'px', height:(r.height + 10) + 'px', opacity:1});
    }, [sel, on]);
  }
  async function ring(){
    await page.evaluate(([x, y]) => { const r = document.getElementById('__ring'); Object.assign(r.style, {left:x + 'px', top:y + 'px', opacity:1, width:'20px', height:'20px'}); }, [cur.x, cur.y]);
    for (let i = 1; i <= 10; i++){
      await page.evaluate(([i]) => { const r = document.getElementById('__ring'); const s = 20 + i*3.5; r.style.width = r.style.height = s + 'px'; r.style.opacity = 1 - i/10; }, [i]);
      await frame();
    }
  }
  async function click(sel, opt = {}){
    await scrollTo(sel);
    const [x, y] = await elCenter(sel);
    await highlight(sel, true);
    await moveTo(x, y, opt.move ?? 0.6);
    await wait(0.15);
    await page.mouse.click(x, y);
    await ring();
    await highlight(sel, false);
  }
  async function world(P){       // maailmapunkt → ekraan
    return page.evaluate(P => { const q = __mv.proj(...P); const r = document.getElementById('cv').getBoundingClientRect(); return [q[0] + r.left, q[1] + r.top]; }, P);
  }
  async function clickWorld(P){ const [x, y] = await world(P); await moveTo(x, y, 0.6); await wait(0.1); await page.mouse.click(x, y); await ring(); }
  async function hoverWorld(P, sec = 0.8){ const [x, y] = await world(P); await moveTo(x, y, sec); }
  async function dragScreen(x1, y1, x2, y2, sec = 1.5){
    await moveTo(x1, y1, 0.5); await wait(0.1);
    await page.mouse.down();
    await moveTo(x2, y2, sec);
    await page.mouse.up(); await wait(0.1);
  }
  async function dragWorld(P1, P2, sec = 1.6){
    const [x1, y1] = await world(P1); await moveTo(x1, y1, 0.6); await wait(0.1);
    await page.mouse.down();
    const [a, b] = [await world(P1), await world(P2)];     // vaade ei muutu lohistamise ajal
    await moveTo(b[0], b[1], sec);
    await page.mouse.up(); await wait(0.15);
  }
  async function slider(sel, value, sec = 1.2){
    await scrollTo(sel);
    const pos = v => page.evaluate(([sel, v]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(); const t = (v - +el.min)/(+el.max - +el.min); return [r.left + 8 + t*(r.width - 16), r.top + r.height/2]; }, [sel, v]);
    const v0 = await page.evaluate(sel => +document.querySelector(sel).value, sel);
    const [x1, y1] = await pos(v0), [x2, y2] = await pos(value);
    await highlight(sel, true);
    await moveTo(x1, y1, 0.6); await page.mouse.down();
    await moveTo(x2, y2, sec); await page.mouse.up();
    await highlight(sel, false);
  }
  // valik rippmenüüst: esiletõst, kursor, klõps-ring ja väärtus (natiivset menüüd ei avata – see ei paistaks videos)
  async function choose(sel, value){
    const [x, y] = await elCenter(sel);
    await highlight(sel, true);
    await moveTo(x, y, 0.6); await wait(0.15); await ring();
    await page.selectOption(sel, value);
    await wait(0.3); await highlight(sel, false);
  }
  async function wheel(dy, n = 6){ for (let i = 0; i < n; i++){ await page.mouse.wheel(0, dy); await frame(); await frame(); } }
  async function caption(text){ await page.evaluate(t => { const c = document.getElementById('__cap'); c.textContent = t || ''; c.style.opacity = t ? 1 : 0; }, text); }
  async function card(t, s, u){ await page.evaluate(([t, s, u]) => { const c = document.getElementById('__card'); if (!t){ c.style.display = 'none'; return; } c.style.display = 'flex'; c.querySelector('.t').textContent = t; c.querySelector('.s').textContent = s || ''; c.querySelector('.u').textContent = u || ''; document.getElementById('__cur').style.display = 'none'; }, [t, s, u]);
    if (!t) await page.evaluate(() => { document.getElementById('__cur').style.display = ''; }); }
  const js = (f, a) => page.evaluate(f, a);

  const api = {page, wait, moveTo, click, choose, ring, clickWorld, hoverWorld, dragScreen, dragWorld, slider, wheel, caption, card, js, world, scrollTo, highlight, cur};
  for (const sc of scenario.scenes){
    const t0 = now();
    if (sc.caption !== undefined) await caption(sc.caption);
    const speechAt = t0 + (sc.speechDelay ?? 0.4);
    if (sc.speech) audio.push([sc.speech, speechAt]);
    const speechEnd = sc.speech ? speechAt + clipDur(sc.speech) : t0;
    await sc.run(api);
    const minEnd = Math.max(speechEnd + (sc.tail ?? 0.9), t0 + (sc.min ?? 0));
    if (now() < minEnd) await wait(minEnd - now());
    sceneLog.push({name:sc.name, start:+t0.toFixed(2), end:+now().toFixed(2), speech:sc.speech, speechEnd:+speechEnd.toFixed(2)});
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();

  // heli: iga klipp oma ajahetkel
  const dur = frames/FPS, inputs = [], filters = [];
  audio.forEach(([id, at], i) => {
    const f = path.join(CLIPS, id + '.wav');
    if (!fs.existsSync(f)) return;
    inputs.push('-i', f); filters.push(`[${inputs.length/2}:a]aresample=48000,adelay=${Math.round(at*1000)}:all=1[a${i}]`);
  });
  if (filters.length){
    const labels = filters.map(f => f.match(/\[a\d+\]$/)[0]).join('');
    const fc = filters.join(';') + `;${labels}amix=inputs=${filters.length}:normalize=0,apad,atrim=0:${dur.toFixed(3)}[aout]`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmpV, ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', '48000', '-movflags', '+faststart', outFile]);
  } else {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmpV, '-c', 'copy', '-movflags', '+faststart', outFile]);
  }
  fs.unlinkSync(tmpV);
  fs.writeFileSync(outFile.replace(/\.mp4$/, '.log.json'), JSON.stringify({dur, scenes:sceneLog, errs}, null, 1));
  console.log('valmis', outFile, 'kestus', dur.toFixed(1), 's, vead:', errs);
}

run(SCEN, path.resolve(process.argv[3])).catch(e => { console.error(e); process.exit(1); });
