import { API } from '../../config/api.js';
import './AIWidget.css';

class AIWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.busy = false;
  }
  connectedCallback() {
    if (this.shadowRoot.querySelector('.ajw')) return;
    this.shadowRoot.innerHTML = `
      <div class="ajw">
        <section class="panel" role="dialog" aria-label="AI assistant">
          <header class="header"><span>Alsyed Jalal AI Assistant</span><button class="close" type="button" aria-label="Close">×</button></header>
          <div class="messages" aria-live="polite"></div>
          <form class="form"><input maxlength="500" placeholder="Message…" aria-label="Message" autocomplete="off"><button class="send" type="submit">Send</button></form>
        </section>
        <button class="toggle" type="button" aria-label="Open chat">💬</button>
      </div>`;
    const root = this.shadowRoot;
    this.messages = root.querySelector('.messages');
    this.input = root.querySelector('input');
    root.querySelector('.toggle').addEventListener('click', () => { root.querySelector('.ajw').classList.add('open'); this.input.focus(); });
    root.querySelector('.close').addEventListener('click', () => root.querySelector('.ajw').classList.remove('open'));
    root.querySelector('form').addEventListener('submit', (e) => this.send(e));
    this.addMessage('Assalam-o-Alaikum! Aap kis cheez mein help chahte hain?', false);
  }
  addMessage(text, user) {
    const row = document.createElement('div'); row.className = `message${user ? ' user' : ''}`;
    const bubble = document.createElement('span'); bubble.textContent = text; row.appendChild(bubble); this.messages.appendChild(row); this.messages.scrollTop = this.messages.scrollHeight; return bubble;
  }
  async send(event) {
    event.preventDefault();
    const prompt = this.input.value.trim();
    if (!prompt || this.busy) return;
    this.addMessage(prompt, true); this.input.value = ''; this.busy = true;
    const reply = this.addMessage('Typing…', false);
    try {
      const response = await fetch(API.chat(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chat failed');
      reply.textContent = data.reply || 'No reply.';
    } catch (error) {
      reply.textContent = error?.message === 'Failed to fetch' ? 'Cannot reach the server.' : (error?.message || 'Chat failed');
    } finally { this.busy = false; }
  }
}

if (!customElements.get('ai-syed-jalal-widget')) customElements.define('ai-syed-jalal-widget', AIWidget);
const mount = () => { if (!document.querySelector('ai-syed-jalal-widget')) document.body.appendChild(document.createElement('ai-syed-jalal-widget')); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
