/* Safe, dependency-free Markdown rendering for assistant replies. */
(() => {
  'use strict';
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function highlight(code) {
    const token = /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|def|else|export|false|for|from|function|if|import|in|let|new|null|return|throw|true|try|var|while)\b|\b\d+(?:\.\d+)?\b/g;
    let result = '', cursor = 0, match;
    while ((match = token.exec(code))) {
      result += escapeHtml(code.slice(cursor, match.index));
      const value = match[0];
      const kind = /^(\/\/|#|\/\*)/.test(value) ? 'comment'
        : /^["'`]/.test(value) ? 'string'
        : /^\d/.test(value) ? 'number' : 'keyword';
      result += `<span class="hl-${kind}">${escapeHtml(value)}</span>`;
      cursor = match.index + value.length;
    }
    return result + escapeHtml(code.slice(cursor));
  }

  function inline(source) {
    const tokens = [];
    const hold = html => {
      const marker = `\u0001${tokens.length}\u0002`;
      tokens.push(html);
      return marker;
    };
    let text = String(source).replace(/`([^`]+)`/g, (_, code) => hold(`<code class="inline-code">${escapeHtml(code)}</code>`));
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_, label, address) => {
      let safe = false;
      try { safe = ['https:', 'http:', 'mailto:'].includes(new URL(address).protocol); } catch {}
      return safe ? hold(`<a href="${escapeHtml(address)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`) : escapeHtml(label);
    });
    text = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    return text.replace(/\u0001(\d+)\u0002/g, (_, index) => tokens[Number(index)] || '');
  }

  const isTableRule = line => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  const isBlockStart = (lines, index) => /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|>\s?|---+\s*$)/.test(lines[index]) || (index + 1 < lines.length && isTableRule(lines[index + 1]));

  function render(source) {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const fence = line.match(/^```([\w.+-]*)\s*$/);
      if (fence) {
        const code = [];
        index++;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
        if (index < lines.length) index++;
        const language = fence[1] ? ` language-${escapeHtml(fence[1].toLowerCase())}` : '';
        blocks.push(`<pre class="code-block"><button type="button" class="copy-code" data-copy-code aria-label="Copy code block">Copy</button><code class="${language.trim()}">${highlight(code.join('\n'))}</code></pre>`);
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) { const level = heading[1].length; blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`); index++; continue; }
      if (/^\s*(---+|\*\s*\*\s*\*|___+)\s*$/.test(line)) { blocks.push('<hr>'); index++; continue; }
      if (index + 1 < lines.length && line.includes('|') && isTableRule(lines[index + 1])) {
        const headers = cells(line), rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(cells(lines[index++]));
        blocks.push(`<div class="table-scroll"><table><thead><tr>${headers.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, column) => `<td>${inline(row[column] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const list = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
      if (list) {
        const ordered = /^\d/.test(list[1]), items = [];
        while (index < lines.length) {
          const item = lines[index].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
          if (!item || /^\d/.test(item[1]) !== ordered) break;
          items.push(`<li>${inline(item[2])}</li>`); index++;
        }
        blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
        blocks.push(`<blockquote>${quote.map(item => `<p>${inline(item)}</p>`).join('')}</blockquote>`);
        continue;
      }
      const paragraph = [line]; index++;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraph.push(lines[index++]);
      blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    }
    return `<div class="chat-markdown">${blocks.join('')}</div>`;
  }

  globalThis.AJChatMarkdown = Object.freeze({ render });
})();
