// Stage 29B-1C: every browser-check command is bounded and reports which command hung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cdp } from '../browser/lib/chrome.mjs';

class FakeSocket {
  listeners = {};
  sent = [];
  addEventListener(type, listener) { this.listeners[type] = listener; }
  send(data) { this.sent.push(JSON.parse(data)); }
  reply(message) { this.listeners.message({ data: JSON.stringify(message) }); }
}

function client() {
  const real = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  try { return new Cdp('ws://unused'); } finally { globalThis.WebSocket = real; }
}

test('an unanswered command rejects, names itself, and is forgotten', async () => {
  const cdp = client();
  await assert.rejects(cdp.send('Runtime.evaluate', { expression: 'while(1){}' }, 20), /CDP Runtime\.evaluate did not answer within 20 ms: .*while\(1\)/);
  assert.equal(cdp.pending.size, 0);
  cdp.ws.reply({ id: 1, result: {} }); // a late answer is ignored
});

test('answers and protocol errors settle the command and clear its timer', async () => {
  const cdp = client();
  const ok = cdp.send('Page.enable', {}, 20);
  cdp.ws.reply({ id: 1, result: { done: true } });
  assert.deepEqual(await ok, { done: true });
  const bad = cdp.send('Page.nope', {}, 20);
  cdp.ws.reply({ id: 2, error: { message: 'no such method' } });
  await assert.rejects(bad, /no such method/);
  assert.equal(cdp.pending.size, 0);
});
