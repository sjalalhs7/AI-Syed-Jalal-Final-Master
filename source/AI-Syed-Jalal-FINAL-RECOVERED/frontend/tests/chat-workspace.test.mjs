import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../jalalai.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../assets/jalalai.js', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../assets/chat-workspace.css', import.meta.url), 'utf8');
const markdownCss = readFileSync(new URL('../assets/chat-markdown.css', import.meta.url), 'utf8');

test('JalalAi provides a focused conversation, starter prompts, Enter/Shift+Enter, and optional controls', () => {
  assert.match(page, /id="chatlog"[^>]*role="log"/);
  assert.match(page, /data-prompt="Explain a difficult idea in simple terms"/);
  assert.match(page, /<details class="assistant-settings" open>/);
  assert.match(client, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(client, /disabled = !user \|\| busy/);
  assert.match(layout, /position:sticky;bottom:0/);
  assert.match(layout, /env\(safe-area-inset-bottom/);
});

test('assistant waits are announced and do not pretend the non-streaming provider is token-streaming', () => {
  assert.match(client, /addTypingIndicator/);
  assert.match(client, /Waiting for the selected assistant/);
  assert.match(client, /The application hit an internal error \(500\)/);
  assert.match(client, /static GitHub Pages cannot run the chat API/);
  assert.match(markdownCss, /\.typing-dots/);
});

test('Markdown and highlighted code styles are available on the chat page', () => {
  assert.match(page, /chat-markdown\.css/);
  assert.match(page, /chat-markdown\.js/);
  assert.match(page, /chat-workspace\.css/);
  assert.match(markdownCss, /\.hl-keyword/);
  assert.match(markdownCss, /\.copy-code/);
});
