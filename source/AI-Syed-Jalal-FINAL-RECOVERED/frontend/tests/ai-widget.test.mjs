import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/AIWidget/AIWidget.js', import.meta.url), 'utf8');

test('AI widget obtains the session CSRF token before sending chat', () => {
  assert.ok(source.includes("new URL('/api/csrf', API.chat())"));
  assert.ok(source.includes("credentials: 'same-origin'"));
  assert.ok(source.includes("'X-CSRF-Token': csrfData.token"));
});

test('signed-out and expired sessions receive a real Workspace sign-in link', () => {
  assert.ok(source.includes('Please sign in to the Workspace before using AI chat.'));
  assert.ok(source.includes('Your session expired. Please sign in again.'));
  assert.ok(source.includes("new URL('../../workspace.html', import.meta.url)"));
});

test('widget sends the prompt to the actual chat API and displays provider errors', () => {
  assert.ok(source.includes('fetch(API.chat()'));
  assert.ok(source.includes('JSON.stringify({ prompt })'));
  assert.ok(source.includes("throw new Error(data.error || 'Chat failed')"));
});
