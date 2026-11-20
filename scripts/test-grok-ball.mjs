import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tag = '') {
    this.tag = tag; this.children = []; this.attrs = new Map(); this.dataset = {};
    this.handlers = new Map(); this.className = ''; this.style = { setProperty(k, v) { this[k] = v; } };
    this.classList = { toggle: (c, active) => {
      const list = new Set(this.className.split(' ').filter(Boolean));
      if (active) list.add(c); else list.delete(c);
      this.className = [...list].join(' '); return active;
    } };
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(n) { this.children.push(n); n.parentNode = this; return n; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  removeChild(n) { this.children = this.children.filter(x => x !== n); n.parentNode = null; }
  replaceChildren(...nodes) { [...this.children].forEach(n => this.removeChild(n)); this.append(...nodes); }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener(name, fn) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), fn]);
  }
  get firstChild() { return this.children[0] ?? null; }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  focus() { this.focused = true; }
  fire(name, evt = {}) { (this.handlers.get(name) || []).forEach(fn => fn(evt)); }
  querySelectorAll(q) {
    const matches = q.startsWith('.') ? n => n.className.split(' ').includes(q.slice(1)) : n => n.tag === q;
    return this.children.flatMap(n => [...(matches(n) ? [n] : []), ...n.querySelectorAll(q)]);
  }
}
function harness(saved, withStorage = true, reducedMotion = false, protocol = 'file:') {
  const nodes = Object.fromEntries(['bodyControls', 'previewBody', 'controls', 'previewBall', 'ball', 'previewName',
    'previewId', 'previewDesc', 'colorMode', 'colorInput', 'sizeRange', 'stageNotes', 'stageOpen', 'stageMembers', 'stageEncore', 'stageLive', 'stageProp', 'stagePropUse', 'stageRole', 'stageSfx', 'stageMusic', 'stageMusicOpen', 'stageMusicLoad', 'stageMusicLink', 'stageMusicTitle', 'stageTrackCopy', 'stageMusicInfo', 'stagePlayer'].map(id => [id, new Element()]));
  for (const match of html.matchAll(/class="stage-member" data-body="([^"]+)"/g)) {
    const button = new Element('button');
    button.className = 'stage-member'; button.dataset.body = match[1];
    nodes.stageMembers.appendChild(button);
  }
  nodes.colorMode.value = 'auto'; nodes.colorInput.value = '#1a1a1a'; nodes.sizeRange.value = '260'; nodes.sizeRange.min = '140'; nodes.sizeRange.max = '320';
  const storage = new Map(saved || []);
  let now = 100, nextId = 1;
  const frames = new Map();
  const win = new Element('window');
  win.matchMedia = () => ({ matches: reducedMotion });
  win.location = { protocol };
  const document = new Element('document');
  document.getElementById = id => nodes[id];
  document.querySelector = q => q.startsWith('#') ? nodes[q.slice(1)] : null;
  document.createElementNS = (_, tag) => new Element(tag);
  document.createElement = tag => new Element(tag);
  const sandbox = vm.createContext({ window: win, document, console, performance: { now: () => now },
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    localStorage: { getItem(key) { if (!withStorage) throw new Error('private mode'); return storage.get(key) ?? null; },
      setItem(k,v) { if (!withStorage) throw new Error('private mode'); storage.set(k,v); } } });
  function advance(ms, ticks = 1) {
    for (let i = 0; i < ticks; i++) {
      now += ms;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(fn => fn(now));
    }
  }
  return { sandbox, win, document, nodes, storage, advance };
}

const source = fs.readFileSync(new URL('../src/grok-ball.js', import.meta.url),'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]);
assert.equal(scripts.length, 2);
assert.doesNotMatch(html, /<(?:script|iframe|audio|video|link|img)\b[^>]*(?:src|href)=["']https?:/i);
assert.deepEqual(Array.from(html.matchAll(/class="stage-member" data-body="([^"]+)"/g), m => m[1]),
  ['encore','red','sunshine','jade','backbeat']);
for (const track of ['5VUUGZ1-nlY', 'EZxVmhM6UpE', 'LQ2s10P5i08']) {
  assert.ok(html.includes('https://www.youtube.com/watch?v=' + track + '" target="_blank" rel="noopener noreferrer"'));
}
assert.match(html, /<dialog [^>]*id="stageNotes"[\s\S]+?<form method="dialog">/);
const legend = [
  '00','01','02','03','04','05','06','07','10','11','12','13','14','15','16','17','18','19','20','21',
  '30','31','32','33','34','35','36','37','38','39','40','41'
];
const ids = ['classic','midnight','encore','red','sunshine','jade','backbeat','night-seed','sprout'];
for (const code of [source, scripts[0]]) {
  const app = harness();
  vm.runInContext(code, app.sandbox);
  const api = app.win.GrokBall;
  assert.deepEqual(Array.from(api.BODIES, e => e.id), ids);
  assert.deepEqual(Array.from(api.EMOTIONS, e => e.id).filter(id => !['22','23','24','25','42','43','44','45','46','47'].includes(id)), legend);
  assert.equal(api.EMOTIONS.length, 42);
  for (const body of ids) for (const emotion of api.EMOTIONS) {
    const host = new Element();
    const e = api.create(host, { body, emotion: emotion.id, autostart: false });
    assert.equal(e.bodyId, body); assert.equal(e.emotionId, emotion.id);
    assert.equal(host.children[0].getAttribute('data-grok-body'), body);
    const paths = host.querySelectorAll('path').filter(p => p.getAttribute('transform')?.includes('translate'));
    assert.ok(paths.length >= 2, body + ':' + emotion.id);
    for (const path of paths) {
      assert.ok(!/NaN|Infinity/.test(path.getAttribute('transform')));
      assert.ok(path.getAttribute('d')?.startsWith('M'));
    }
    e.destroy(); assert.equal(host.children.length, 0);
  }
  // Wow animates the real mouth once, then reaches the exact static end pose.
  for (const body of ids) {
    const preview = new Element();
    const animated = api.create(preview,{body, emotion:'02'});
    const node=preview.querySelectorAll('path').find(p=>p.getAttribute('data-grok-mouth')==='');
    const mouthScale = () => Number(node.getAttribute('transform').match(/scale\([^ ]+ ([\d.]+)\)$/)[1]);
    animated.setEmotion('24');
    app.advance(30,1);const first=mouthScale();
    app.advance(30,3);const peak=mouthScale();
    app.advance(30,14);const rest=mouthScale();
    assert.ok(first<rest && peak>rest, body+' wow opening and settle');
    app.advance(30,20);assert.equal(mouthScale(),rest,body+' wow does not loop');
    animated.destroy();
    const staticHost=new Element(), staticBall=api.create(staticHost,{body,emotion:'24',autostart:false});
    const staticMouth=staticHost.querySelectorAll('path').find(p=>p.getAttribute('data-grok-mouth')==='');
    assert.equal(Number(staticMouth.getAttribute('transform').match(/scale\([^ ]+ ([\d.]+)\)$/)[1]),rest);
    staticBall.destroy();
  }
  // Symmetric loading/waking across animations; only the deliberate wink closes one eye.
  const parseScale = value => Number(value.match(/scale\([^ ]+ ([\d.]+)\)/)[1]);
  for (const id of ['05','07','11','36','45']) {
    const host = new Element(), ball=api.create(host,{body:'encore',emotion:id});
    const whites=host.querySelectorAll('ellipse').filter(p=>['#fff4da','#faf5ee'].includes(p.getAttribute('fill')));
    for (let frame=0; frame<12; frame++) {
      app.advance(80);const heights=whites.map(p=>parseScale(p.getAttribute('transform')));
      assert.ok(Math.abs(heights[0]-heights[1])<=.09,id+' matching open/close');
    }
    ball.destroy();
  }
  for (const body of ['classic','encore','sprout']) {
    const host=new Element(), ball=api.create(host,{body,emotion:'02'});
    ball.setEmotion('23');
    const eyes=body==='classic'?host.querySelectorAll('path').filter(p=>p.getAttribute('stroke-width')==='1.6'):
      host.querySelectorAll('ellipse').filter(p=>['#fff4da','#faf5ee'].includes(p.getAttribute('fill')));
    assert.equal(eyes.length,2);
    app.advance(40,2);const open=eyes.map(n=>parseScale(n.getAttribute('transform')));
    app.advance(40,5);const blink=eyes.map(n=>parseScale(n.getAttribute('transform')));
    app.advance(40,7);const restored=eyes.map(n=>parseScale(n.getAttribute('transform')));
    assert.ok(open[0]>.6 && blink[0]<.25 && restored[0]>.6,body+' left eye closes and reopens');
    assert.ok([open[1],blink[1],restored[1]].every(v=>v>.6),body+' right stays open');
    ball.destroy();
  }
  const peek = api.config.get('45');
  assert.deepEqual(Array.from(peek.pool),[1]);
  const pair = app.win.EB_RINGS.EXPRESSIONS[1], height = eye=>Math.max(...eye.map(p=>p[1]))-Math.min(...eye.map(p=>p[1]));
  assert.ok(Math.max(height(pair[0]),height(pair[1]))/Math.min(height(pair[0]),height(pair[1]))<1.05);
  for (const body of ids.slice(2)) {
    const host=new Element(), ball=api.create(host,{body,emotion:'45',autostart:false});
    const eyeWhites=host.querySelectorAll('ellipse').filter(p=>['#fff4da','#faf5ee'].includes(p.getAttribute('fill')));
    assert.equal(eyeWhites.length,2,body+' peek whites');
    const heights=eyeWhites.map(p=>Number(p.getAttribute('transform').match(/scale\(1 ([\d.]+)\)/)[1]));
    assert.ok(Math.max(...heights)/Math.min(...heights)<1.1,body+' peek two balanced eyes');
    ball.destroy();
  }
  // Soft bodies have visible embroidered eyes rather than the classic ring paths.
  // Changing the expression and body controls does not blend the two face rigs.
  const faceHost = new Element();
  const faceBall = api.create(faceHost, { body: 'encore', emotion: '02', autostart: false });
  const eyeWhite = () => faceHost.querySelectorAll('ellipse').filter(p => p.getAttribute('fill') === '#fff4da');
  const distinctMouth = () => faceHost.querySelectorAll('path').find(p => p.getAttribute('stroke-width') === '7.5')?.getAttribute('d');
  assert.equal(eyeWhite().length, 2);
  const wave = distinctMouth();
  assert.ok(wave);
  faceBall.setBody('jade');
  assert.notEqual(distinctMouth(), wave);
  faceBall.setBody('sunshine');
  assert.ok(faceHost.querySelectorAll('g').some(g => g.getAttribute('clip-path')?.match(/lid[01]/)));
  faceBall.setEmotion('24');
  assert.ok(!faceHost.querySelectorAll('g').some(g => g.getAttribute('clip-path')?.match(/lid[01]/)));
  faceBall.setBody('classic');
  assert.equal(faceBall.emotionId, '24');
  assert.ok(faceHost.querySelectorAll('path').some(p => p.style.display === ''));
  faceBall.destroy();

  // The tall top silhouettes fit without shifting or recoloring the other bodies on switch.
  const mojoHost = new Element();
  const mojo = api.create(mojoHost, { body: 'night-seed', emotion: '02', autostart: false });
  const mojoSvg = mojoHost.children[0];
  const visiblePaths = () => mojoHost.querySelectorAll('path').filter(path => path.getAttribute('display') !== 'none');
  assert.equal(mojoSvg.getAttribute('viewBox'), '-32 -116 293 372');
  assert.equal(visiblePaths().filter(path => path.getAttribute('stroke-width') === '6.3').length, 2);
  assert.equal(visiblePaths().filter(path => ['#151b40', '#1a214a', '#202851'].includes(path.getAttribute('fill'))).length, 3);
  mojo.setBody('sprout');
  const visibleColor = fill => visiblePaths().filter(path => path.getAttribute('fill') === fill).length;
  assert.equal(visibleColor('#e48b9a'), 0);
  assert.equal(visibleColor('#f3cf48'), 0);
  assert.equal(visiblePaths().filter(path => ['#71ac35', '#76b63b', '#97ca47'].includes(path.getAttribute('fill'))).length, 3);
  mojo.setEmotion('22');
  assert.equal(visibleColor('#f3cf48'), 2);
  assert.equal(visibleColor('#e48b9a'), 1);
  mojo.setEmotion('25');
  assert.equal(visiblePaths().filter(path => path.getAttribute('fill') === '#ffa0af').length, 2);
  assert.equal(visiblePaths().filter(path => path.getAttribute('fill') === '#f3cf48').length, 0);
  mojo.setBody('encore');
  assert.equal(mojo.emotionId, '25');
  assert.equal(mojoSvg.getAttribute('viewBox'), '-15 -15 259 259');
  assert.equal(mojoHost.querySelectorAll('ellipse').filter(n => n.getAttribute('fill') === '#fff4da').length, 2);
  mojo.setBody('backbeat');
  mojo.setEmotion('42');
  assert.ok(visiblePaths().some(path => path.getAttribute('fill') === '#fff2dc'));
  mojo.setEmotion('47');
  assert.equal(visiblePaths().filter(path => path.getAttribute('fill') === '#85d9ff').length, 2);
  mojo.setEmotion('02');
  assert.equal(visiblePaths().filter(path => ['#fff2dc','#85d9ff'].includes(path.getAttribute('fill'))).length, 0);
  mojo.destroy();

  const host = new Element();
  const ball = api.create(host, { emotion: '02' });
  const firstSvg = host.children[0];
  const events = [];
  ball.on('change', e => events.push(e.id));
  assert.equal(ball.handleAIMessage('{"emotionId":"30"}'), true);
  ball.setGaze(0.4, -0.3);
  ball.spin(1);
  assert.equal(ball.setBody('sprout'), true);
  assert.equal(ball.setBody('does-not-exist'), false);
  assert.equal(ball.emotionId, '30');
  assert.equal(ball.bodyId, 'sprout');
  assert.equal(firstSvg, host.children[0]);
  assert.deepEqual(events, ['30']);
  app.advance(16, 15);
  assert.equal(host.children[0].getAttribute('data-grok-body'), 'sprout');
  ball.destroy();
  const config = api.config.get('22');
  assert.ok(config && config.pool[0] >= 25);
}
const app = harness();
scripts.forEach(code => vm.runInContext(code, app.sandbox));
const { nodes } = app;
assert.equal(nodes.bodyControls.querySelectorAll('.body-card').length, 9);
assert.equal(nodes.controls.querySelectorAll('.emo-card').length, 42);
const bodyCard = id => nodes.bodyControls.querySelectorAll('.body-card').find(el => el.dataset.body === id);
const emoCard = id => nodes.controls.querySelectorAll('.emo-card').find(el => el.dataset.id === id);
bodyCard('encore').fire('click');
emoCard('25').fire('click');
bodyCard('backbeat').fire('click');
assert.equal(bodyCard('backbeat').getAttribute('aria-pressed'), 'true');
assert.equal(emoCard('25').getAttribute('aria-pressed'), 'true');
assert.equal(nodes.previewBall.children[0].getAttribute('data-grok-body'), 'backbeat');
assert.equal(nodes.previewId.textContent, 'ID 25');
assert.ok(nodes.controls.querySelectorAll('svg').every(el => el.getAttribute('data-grok-body') === 'backbeat'));
nodes.colorMode.value = 'custom'; nodes.colorMode.fire('change');
assert.equal(nodes.previewBall.children[0].getAttribute('data-grok-body'), 'backbeat');
assert.equal(emoCard('25').getAttribute('aria-pressed'), 'true');
nodes.sizeRange.value = '320'; nodes.sizeRange.fire('input');
assert.equal(nodes.previewBall.style['--ball-size'], '320px');
const reload = harness(app.storage);
scripts.forEach(code => vm.runInContext(code, reload.sandbox));
assert.equal(reload.nodes.previewBall.children[0].getAttribute('data-grok-body'), 'backbeat');
assert.equal(reload.nodes.previewId.textContent, 'ID 25');
const privateTab = harness(undefined, false);
scripts.forEach(code => vm.runInContext(code, privateTab.sandbox));
assert.equal(privateTab.nodes.previewId.textContent, 'ID 02');
assert.equal(privateTab.nodes.previewBall.children[0].getAttribute('data-grok-body'), 'classic');
for (const reduced of [false, true]) {
  const stage = harness(undefined, true, reduced);
  vm.runInContext(scripts[0], stage.sandbox);
  const api = stage.win.GrokBall;
  const calls = [];
  stage.win.GrokBall = {...api, create(target, options) {
    const engine = api.create(target, options);
    if (target === stage.nodes.previewBall) {
      const spin = engine.spin.bind(engine), burst = engine.burst.bind(engine);
      engine.spin = (count) => { calls.push(['spin', count]); return spin(count); };
      engine.burst = (count) => { calls.push(['burst', count]); return burst(count); };
    }
    return engine;
  }};
  vm.runInContext(scripts[1], stage.sandbox);
  const {stageNotes, stageOpen, stageMembers, stageEncore, stageLive, previewBall, previewId, controls, stageProp, stagePropUse, stageRole} = stage.nodes;
  assert.equal(stageProp.hidden,true);
  const props={encore:['mic','主唱大人'],red:['red-guitar','怪兽'],sunshine:['bass','玛莎'],jade:['jade-guitar','石头'],backbeat:['drums','冠佑']};
  controls.querySelectorAll('.emo-card').find(card => card.dataset.id === '25').fire('click');
  for (const member of stageMembers.children) {
    stageOpen.fire('click'); assert.equal(stageNotes.open, true);
    stageOpen.focused = false;
    member.fire('click'); assert.equal(stageNotes.open, false); assert.equal(stageOpen.focused, true);
    assert.equal(previewBall.children[0].getAttribute('data-grok-body'), member.dataset.body);
    assert.equal(previewId.textContent, 'ID 25');
    assert.equal(stageMembers.children.filter(node => node.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(member.getAttribute('aria-pressed'), 'true');
    const [prop, role] = props[member.dataset.body];
    assert.equal(stageProp.hidden,false);
    assert.equal(stagePropUse.getAttribute('href'),'#instrument-'+prop);
    assert.ok(html.includes('<symbol id="instrument-'+prop+'"'));
    assert.ok(stageRole.textContent.includes(role));
    assert.equal(stageRole.hidden,false);
  }
  stageEncore.fire('click');
  assert.match(stageLive.textContent, /冠佑眼镜蓝球/);
  assert.deepEqual(calls, reduced ? [] : [['spin', 1], ['burst', 20]]);
  assert.equal(previewBall.children[0].getAttribute('data-grok-body'), 'backbeat');
  assert.equal(previewId.textContent, 'ID 25');
  stage.nodes.bodyControls.querySelectorAll('.body-card').find(card=>card.dataset.body==='sprout').fire('click');
  assert.equal(stageProp.hidden,true);assert.equal(stageRole.hidden,true);assert.equal(stagePropUse.getAttribute('href'),null);
}
for (const protocol of ['file:', 'https:']) {
  const audio=harness(undefined,true,false,protocol), {nodes,document}=audio;
  scripts.forEach(code=>vm.runInContext(code,audio.sandbox));
  const loaded=nodes.stagePlayer, dialog=nodes.stageMusic, load=nodes.stageMusicLoad;
  assert.equal(nodes.stageMusicOpen.hidden,true);assert.equal(loaded.children.length,0);
  const tracks=[['encore','qX2GsMj7154','干杯'],['red','srP_Fm7f-eg','九号球'],
    ['sunshine','V46K7apDziA','诺亚方舟'],['jade','uzVdsZbYibQ','如烟'],['backbeat','03-ge__OaIU','夜访吸血鬼']];
  for (const [id,yt,title] of tracks) {
    nodes.bodyControls.querySelectorAll('.body-card').find(card=>card.dataset.body===id).fire('click');
    assert.equal(nodes.stageMusicOpen.hidden,false);
    assert.equal(nodes.stageMusicLink.getAttribute('href'),'https://www.youtube.com/watch?v='+yt);
    assert.ok(nodes.stageMusicTitle.textContent.includes(title));
    nodes.stageMusicOpen.fire('click');assert.equal(dialog.open,true);
    assert.equal(loaded.children.length,0,'opening song chooser never connects');
    load.fire('click');load.fire('click');
    if (protocol==='file:') {
      assert.equal(load.hidden,true);assert.equal(loaded.children.length,0);
    } else {
      assert.equal(loaded.children.length,1,'single visible official player');
      assert.equal(loaded.firstChild.getAttribute('src'),'https://www.youtube-nocookie.com/embed/'+yt+'?playsinline=1');
      assert.equal(loaded.firstChild.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
      assert.equal(load.hidden,true);
      document.hidden=true;document.fire('visibilitychange');
      assert.equal(loaded.children.length,0,'tab hidden stops playback');
      document.hidden=false;
      load.fire('click');assert.equal(loaded.children.length,1);
    }
    dialog.close();assert.equal(loaded.children.length,0);assert.equal(nodes.stageMusicOpen.focused,true);
  }
}
{
  const defaultSelection = [['grok-ball-pro.selection.v1', JSON.stringify({ body: 'encore', emotion: '25' })]];
  const silent = harness(defaultSelection);
  scripts.forEach(code => vm.runInContext(code, silent.sandbox));
  assert.equal(silent.nodes.stageSfx.hidden, true, 'graceful without Web Audio');

  const app = harness(defaultSelection);
  const { nodes, win, document } = app;
  const played = [];
  let contexts = 0, resume;
  win.AudioContext = class {
    constructor() { contexts++; this.state = 'suspended'; this.sampleRate = 24000; this.currentTime = 1; }
    resume() { return new Promise(resolve => { resume = () => { this.state = 'running'; resolve(); }; }); }
    createGain() { return { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createBuffer(_, n, rate) {
      const samples = new Float32Array(n);
      return { getChannelData: () => samples, duration: n / rate };
    }
    createBufferSource() {
      return { start() { played.push(this); }, stop() { this.stopped = true; }, connect() {}, disconnect() {} };
    }
  };
  scripts.forEach(code => vm.runInContext(code, app.sandbox));
  const clickBall = id => nodes.bodyControls.querySelectorAll('.body-card').find(card => card.dataset.body === id).fire('click');
  assert.equal(nodes.stageSfx.hidden, false);
  clickBall('red');
  assert.equal(contexts, 0, 'neither restoring a member nor choosing one while muted initializes audio');
  nodes.stageSfx.fire('click');
  assert.equal(nodes.stageSfx.getAttribute('aria-pressed'), 'true');
  clickBall('classic');
  resume();
  await Promise.resolve();
  assert.equal(played.length, 0, 'late resume cannot play a prior selection');
  for (const id of ['encore', 'red', 'sunshine', 'jade', 'backbeat']) {
    const last = played.at(-1);
    clickBall(id);
    if (last) assert.equal(last.stopped, true);
    const { buffer } = played.at(-1);
    assert.ok(buffer.duration >= 2 && buffer.duration < 3);
    const samples = buffer.getChannelData(0);
    let peak = 0;
    for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); }
    assert.ok(peak >= .40 && peak <= .43, 'normalized, non-silent cue');
  }
  assert.equal(new Set(played.map(x => x.buffer)).size, 5);
  clickBall('backbeat');
  assert.equal(played.at(-1).buffer, played.at(-2).buffer, 'repeat uses a cached cue');
  const count = played.length;
  nodes.controls.querySelectorAll('.emo-card')[0].fire('click');
  assert.equal(played.length, count, 'changing expression does not start music');
  nodes.stageMusicOpen.fire('click');
  assert.equal(played.at(-1).stopped, true);
  assert.equal(nodes.stagePlayer.children.length, 0, 'official player remains opt-in');
  nodes.stageMusic.close();
  nodes.stageOpen.fire('click');
  nodes.stageMembers.children[3].fire('click');
  assert.equal(played.length, count + 1, 'handbook member switch plays cue');
  document.hidden = true;
  document.fire('visibilitychange');
  assert.equal(played.at(-1).stopped, true);
  clickBall('encore');
  assert.equal(played.length, count + 1, 'hidden tabs neither play nor replay');
  document.hidden = false;
  clickBall('encore');
  win.fire('pagehide');
  assert.equal(played.at(-1).stopped, true);
  clickBall('red');
  nodes.stageSfx.fire('click');
  assert.equal(nodes.stageSfx.getAttribute('aria-pressed'), 'false');
  assert.equal(played.at(-1).stopped, true);
  clickBall('encore');
  assert.equal(played.length, count + 3);
}
{
  const app = harness();
  scripts.forEach(code => vm.runInContext(code, app.sandbox));
  const { sizeRange, previewBall } = app.nodes;
  const caps = [211.2, 237.6, 257.4, 195]; // representative phone viewports
  const width = (cap, factor) => Math.min(140, cap) + (cap - Math.min(140, cap)) * factor;
  const initial = Number(previewBall.style['--ball-growth']);
  assert.equal(initial, 2 / 3);
  assert.equal(previewBall.style['--ball-size'], undefined, 'leave desktop initial CSS sizing unchanged');
  const samples = ['140', '200', '260', '290', '320'].map(value => {
    sizeRange.value = value;
    sizeRange.fire('input');
    assert.equal(previewBall.style['--ball-size'], value + 'px');
    return Number(previewBall.style['--ball-growth']);
  });
  assert.deepEqual(samples, [0, 1/3, 2/3, 5/6, 1]);
  for (const cap of caps) {
    const sizes = samples.map(factor => width(cap, factor));
    assert.ok(sizes.every((n, i) => i === 0 || n > sizes[i - 1]));
    assert.equal(sizes.at(-1), cap);
  }
}
console.log('PASS: source and inline SDK, all 378 presets, legacy IDs/AI, live switches, selection/persistence, private mode, five instruments, encore and reduced motion, Wow mouth, balanced expressions, a genuine wink, opt-in official tracks, and original cue lifecycle');
