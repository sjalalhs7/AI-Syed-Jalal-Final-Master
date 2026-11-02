(function(){
  if(document.getElementById('aj-chat'))return;
  var cfg=document.currentScript||{},base=((cfg.dataset&&cfg.dataset.api)||(function(){try{return localStorage.getItem('aj-v31-api')}catch(e){return ''}})()||(location.protocol.indexOf('http')===0?location.origin:'')).replace(/\/$/,'');
  var st=document.createElement('style');st.textContent='#aj-chat{position:fixed;right:18px;bottom:18px;z-index:40;font-family:system-ui,Arial}#aj-chat .p{display:none;width:340px;max-width:calc(100vw - 36px);background:#0b1220;color:#fff;border:1px solid #ffd15a33;border-radius:16px;box-shadow:0 14px 34px #000a;overflow:hidden}#aj-chat.open .p{display:block}#aj-chat.open .t{display:none}#aj-chat .h{padding:12px 14px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,#ff8b00,#18b86a);color:#10150a;font-weight:800;font-size:13px}#aj-chat .h button{background:none;border:0;font-size:16px;cursor:pointer;color:#10150a}#aj-chat .m{height:280px;overflow:auto;padding:12px 14px}#aj-chat .m div{margin-bottom:10px;display:flex}#aj-chat .m span{max-width:84%;white-space:pre-wrap;padding:9px 12px;border-radius:13px;font-size:13px;line-height:1.4;background:#ffffff14}#aj-chat .m .u{justify-content:flex-end}#aj-chat .m .u span{background:#ff8b00;color:#1a1204}#aj-chat .f{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #ffffff14}#aj-chat input{flex:1;background:#111a2b;border:1px solid #ffffff1f;border-radius:11px;padding:10px;color:#fff;font:inherit;font-size:13px}#aj-chat .f button{background:#18e07a;border:0;border-radius:11px;padding:10px 14px;font-weight:800;color:#04170d;cursor:pointer}#aj-chat .t{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#ffd15a,#ff8b00);font-size:24px;box-shadow:0 8px 24px #000a}';
  document.head.appendChild(st);
  var w=document.createElement('div');w.id='aj-chat';
  w.innerHTML='<div class="p" role="dialog" aria-label="AI assistant"><div class="h"><span>Alsyed Jalal AI Assistant</span><button type="button" aria-label="Close">\u2715</button></div><div class="m" aria-live="polite"></div><form class="f"><input maxlength="500" placeholder="Message\u2026" aria-label="Message"><button>Send</button></form></div><button class="t" type="button" aria-label="Open chat">\ud83d\udcac</button>';
  document.body.appendChild(w);
  var m=w.querySelector('.m'),inp=w.querySelector('input'),busy=false;
  function add(t,r){var d=document.createElement('div'),s=document.createElement('span');if(r==='u')d.className='u';s.textContent=t;d.appendChild(s);m.appendChild(d);m.scrollTop=m.scrollHeight;return s}
  w.querySelector('.t').onclick=function(){w.classList.add('open');inp.focus()};
  w.querySelector('.h button').onclick=function(){w.classList.remove('open')};
  add('Assalam-o-Alaikum! Aap kis cheez mein help chahte hain?','b');
  w.querySelector('form').onsubmit=function(e){e.preventDefault();var t=inp.value.trim();if(!t||busy)return;
    add(t,'u');inp.value='';busy=true;var b=add('Typing\u2026','b');
    fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:t})})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Chat failed');return d})})
      .then(function(d){b.textContent=d.reply||'No reply.'})
      .catch(function(x){b.textContent=x.message==='Failed to fetch'?'Cannot reach the server.':x.message})
      .then(function(){busy=false})};
})();
