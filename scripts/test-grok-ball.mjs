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
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  focus() { this.focused = true; }
  fire(name, evt = {}) { (this.handlers.get(name) || []).forEach(fn => fn(evt)); }
  querySelectorAll(q) {
    const matches = q.startsWith('.') ? n => n.className.split(' ').includes(q.slice(1)) : n => n.tag === q;
    return this.children.flatMap(n => [...(matches(n) ? [n] : []), ...n.querySelectorAll(q)]);
  }
}
function harness(saved, withStorage = true, reducedMotion = false) {
  const nodes = Object.fromEntries(['bodyControls', 'previewBody', 'controls', 'previewBall', 'ball', 'previewName',
    'previewId', 'previewDesc', 'colorMode', 'colorInput', 'sizeRange', 'stageNotes', 'stageOpen', 'stageMembers', 'stageEncore', 'stageLive'].map(id => [id, new Element()]));
  for (const match of html.matchAll(/class="stage-member" data-body="([^"]+)"/g)) {
    const button = new Element('button');
    button.className = 'stage-member'; button.dataset.body = match[1];
    nodes.stageMembers.appendChild(button);
  }
  nodes.colorMode.value = 'auto'; nodes.colorInput.value = '#1a1a1a'; nodes.sizeRange.value = '260';
  const storage = new Map(saved || []);
  let now = 100, nextId = 1;
  const frames = new Map();
  const win = new Element('window');
  win.matchMedia = () => ({ matches: reducedMotion });
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
  const {stageNotes, stageOpen, stageMembers, stageEncore, stageLive, previewBall, previewId, controls} = stage.nodes;
  controls.querySelectorAll('.emo-card').find(card => card.dataset.id === '25').fire('click');
  for (const member of stageMembers.children) {
    stageOpen.fire('click'); assert.equal(stageNotes.open, true);
    stageOpen.focused = false;
    member.fire('click'); assert.equal(stageNotes.open, false); assert.equal(stageOpen.focused, true);
    assert.equal(previewBall.children[0].getAttribute('data-grok-body'), member.dataset.body);
    assert.equal(previewId.textContent, 'ID 25');
    assert.equal(stageMembers.children.filter(node => node.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(member.getAttribute('aria-pressed'), 'true');
  }
  stageEncore.fire('click');
  assert.match(stageLive.textContent, /冠佑眼镜蓝球/);
  assert.deepEqual(calls, reduced ? [] : [['spin', 1], ['burst', 20]]);
  assert.equal(previewBall.children[0].getAttribute('data-grok-body'), 'backbeat');
  assert.equal(previewId.textContent, 'ID 25');
}
console.log('PASS: source and inline SDK, all 378 presets, legacy IDs/AI, live switches, selection/persistence, private mode, five-member dialog, encore and reduced motion');
