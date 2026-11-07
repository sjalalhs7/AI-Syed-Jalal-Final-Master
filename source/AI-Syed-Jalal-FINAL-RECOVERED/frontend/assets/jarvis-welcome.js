/* Browser speech only; no microphone and no server request. */
(() => {
  'use strict';
  const greeting = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay. Allahumma salli ala Muhammadin wa ala aali Muhammad.';
  function mount() {
    const play = document.getElementById('aj-welcome-play');
    const stop = document.getElementById('aj-welcome-stop');
    const status = document.getElementById('aj-welcome-status');
    if (!play || !stop || !status) return;
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance || typeof synth.speak !== 'function') {
      status.textContent = 'Speech is not available in this browser. You can read the greeting above.';
      play.disabled = true;
      return;
    }
    let active = null;
    let timer = null;
    function say(fromTap) {
      if (timer) window.clearTimeout(timer);
      if (active && typeof synth.cancel === 'function') synth.cancel();
      const utterance = new SpeechSynthesisUtterance(greeting);
      if (window.AJSpeech) window.AJSpeech.apply(utterance, { lang: 'en-US' });
      else utterance.lang = 'en-US';
      let started = false;
      let finished = false;
      active = utterance;
      status.textContent = fromTap ? 'Starting the browser voice…' : 'Preparing the JARVIS greeting…';
      utterance.onstart = () => {
        if (active !== utterance) return;
        started = true;
        stop.hidden = false;
        status.textContent = 'JARVIS is speaking. You can stop or replay the greeting.';
      };
      utterance.onend = () => {
        if (active !== utterance) return;
        finished = true;
        active = null;
        stop.hidden = true;
        status.textContent = 'Greeting finished. You can listen again.';
      };
      utterance.onerror = () => {
        if (active !== utterance) return;
        finished = true;
        active = null;
        stop.hidden = true;
        status.textContent = 'The browser could not start voice playback. Tap Listen to try again.';
      };
      try {
        synth.speak(utterance);
        timer = window.setTimeout(() => {
          if (active === utterance && !started && !finished) {
            status.textContent = 'Your browser may require a tap before audio can play. Tap Listen to hear the greeting.';
          }
        }, 1500);
      } catch (_) {
        active = null;
        status.textContent = 'The browser could not start voice playback. Tap Listen to try again.';
      }
    }
    play.addEventListener('click', () => say(true));
    stop.addEventListener('click', () => {
      if (timer) window.clearTimeout(timer);
      active = null;
      if (typeof synth.cancel === 'function') synth.cancel();
      stop.hidden = true;
      status.textContent = 'Greeting stopped. Tap Listen to play it again.';
    });
    window.addEventListener('pagehide', () => {
      if (active && typeof synth.cancel === 'function') synth.cancel();
      active = null;
    });
    say(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
