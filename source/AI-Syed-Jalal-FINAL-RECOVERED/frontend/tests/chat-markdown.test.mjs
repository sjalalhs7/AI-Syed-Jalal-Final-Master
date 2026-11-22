import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/chat-markdown.js';

const render = text => globalThis.AJChatMarkdown.render(text);

test('assistant Markdown supports headings, emphasis, lists, and tables', () => {
  const html = render('# Answer\n\n**Important** and *clear*.\n\n- First\n- Second\n\n| Name | Value |\n| --- | ---: |\n| One | 1 |');
  assert.match(html, /<h1>Answer<\/h1>/);
  assert.match(html, /<strong>Important<\/strong>/);
  assert.match(html, /<em>clear<\/em>/);
  assert.match(html, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(html, /<table>[\s\S]*<th>Name<\/th>[\s\S]*<td>1<\/td>/);
});

test('fenced code is escaped, highlighted, and has a one-click copy control', () => {
  const html = render('```js\nconst answer = "<safe>"; // note\n```');
  assert.match(html, /class="code-block"/);
  assert.match(html, /data-copy-code/);
  assert.match(html, /hl-keyword/);
  assert.match(html, /hl-string/);
  assert.match(html, /hl-comment/);
  assert.match(html, /&lt;safe&gt;/);
  assert.doesNotMatch(html, /<safe>/);
});

test('raw HTML and unsafe link schemes never become executable markup', () => {
  const html = render('<img src=x onerror=alert(1)> [bad](javascript:alert(1)) [good](https://example.com)');
  assert.doesNotMatch(html, /<img\b|href="javascript:/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="https:\/\/example\.com"[^>]*>good<\/a>/);
});
