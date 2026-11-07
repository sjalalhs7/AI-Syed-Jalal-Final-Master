/* JARVIS opening welcome. Audio is same-origin; no microphone or app API is used. */
(() => {
  'use strict';
  if (window.AJWelcome) return;

  const roman = 'Assalamualaikum kia haal hy apka Allah pak apko apni Aman main rakhay, ameen phir drood e pak prhiay.';
  const durood = 'Allahumma salli ala Muhammadin wa ala aali Muhammad.';
  const scriptUrl = document.currentScript?.src || new URL('assets/jarvis-welcome.js', location.href).href;
  const recordingUrl = new URL('jarvis-welcome-ur-pk.mp3?v=157', scriptUrl).href;
  const appRoot = new URL('../', scriptUrl);
  const visitKey = 'aj-welcome-visit-v1';
  const canPlay = typeof window.Audio === 'function';
  let current = null;
  let startTimer = null;
  let hideTimer = null;
  let notice, noticeStatus, noticePlay, noticeStop, inlineStatus, inlinePlay, inlineStop;
  let waitingForVisibility = false;
  let wasHidden = false;
  let hiddenWhilePlaying = false;

  function readVisit() { try { return sessionStorage.getItem(visitKey); } catch (_) { return null; } }
  function writeVisit(value) { try { sessionStorage.setItem(visitKey, value); } catch (_) { /* The welcome still works without storage. */ } }
  function clearTimers() {
    if (startTimer) clearTimeout(startTimer);
    if (hideTimer) clearTimeout(hideTimer);
    startTimer = hideTimer = null;
  }
  function setStatus(text) {
    if (inlineStatus) inlineStatus.textContent = text;
    if (noticeStatus) noticeStatus.textContent = text;
  }
  function showNotice() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (notice) notice.hidden = false;
  }
  function hideNotice() { if (notice) notice.hidden = true; }
  function controls(speaking) {
    if (inlineStop) inlineStop.hidden = !speaking;
    if (noticeStop) noticeStop.hidden = !speaking;
  }
  function stopCurrent() {
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    const previous = current;
    current = null; // Ignore late media events and rejected play promises.
    if (!previous) return;
    previous.audio.onplaying = previous.audio.onended = previous.audio.onerror = null;
    try { previous.audio.pause(); } catch (_) { /* Already stopped. */ }
  }
  function started(run) {
    if (current !== run || run.started) return;
    run.started = true;
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    writeVisit('played');
    controls(true);
    setStatus('JARVIS is speaking your welcome and Durood.');
  }
  function finished(run) {
    if (current !== run) return;
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    current = null;
    writeVisit('played');
    controls(false);
    setStatus('Greeting finished. You can listen again.');
    hideTimer = setTimeout(hideNotice, 3500);
  }
  function blocked(run) {
    if (current !== run) return;
    stopCurrent();
    writeVisit('pending');
    controls(false);
    showNotice();
    setStatus('Your browser may require a tap before audio can play. Tap Listen to hear JARVIS.');
  }
  function unavailable(run) {
    if (current !== run) return;
    stopCurrent();
    writeVisit('pending');
    controls(false);
    showNotice();
    setStatus('The selected JARVIS voice could not be played. Tap Listen to retry, or read the greeting.');
  }
  function armStartTimeout(run) {
    if (startTimer) clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      if (current === run && !run.started) blocked(run);
    }, 2500);
  }
  function playbackFailure(run, error) {
    if (current !== run) return;
    const code = String(error?.name || error?.error || '').toLowerCase();
    if (code === 'notallowederror' || code === 'not-allowed' || code === 'securityerror') {
      blocked(run);
    } else {
      // Our own stop clears current before pausing. An abort for the current
      // run is unexpected and should leave the selected voice retryable.
      unavailable(run);
    }
  }
  function playRecording() {
    let audio;
    try { audio = new window.Audio(recordingUrl); }
    catch (_) {
      const run = { audio: { pause() {} } };
      current = run;
      unavailable(run);
      return;
    }
    const run = { audio, started: false };
    current = run;
    audio.preload = 'auto';
    audio.onplaying = () => started(run);
    audio.onended = () => finished(run);
    audio.onerror = () => playbackFailure(run, audio.error);
    armStartTimeout(run);
    try {
      const playing = audio.play();
      if (playing && typeof playing.then === 'function') {
        playing.then(() => started(run)).catch(error => playbackFailure(run, error));
      }
    } catch (error) { playbackFailure(run, error); }
  }
  function start(fromTap) {
    clearTimers();
    stopCurrent();
    controls(false);
    showNotice();
    writeVisit('pending');
    setStatus(fromTap ? 'Starting the JARVIS greeting…' : 'Preparing the JARVIS greeting…');
    // The user selected this recorded JARVIS voice. Never replace the opening
    // with a browser default or another saved assistant-reply voice.
    if (canPlay) playRecording();
    else {
      if (inlinePlay) inlinePlay.disabled = true;
      if (noticePlay) noticePlay.disabled = true;
      setStatus('Audio is not available in this browser. You can read the greeting below.');
    }
  }
  function stop() {
    clearTimers();
    stopCurrent();
    controls(false);
    writeVisit('played');
    setStatus('Greeting stopped. Tap Listen to play it again.');
  }
  function interruptForAssistant() {
    if (!current && (!notice || notice.hidden)) return;
    stop();
    setStatus('Welcome stopped while using JARVIS. Tap Listen to hear it again.');
    hideNotice();
  }
  window.AJWelcome = Object.freeze({ interruptForAssistant });

  function isFreshEntry() {
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    if (navigation?.type === 'reload') return true;
    let internal = false;
    try {
      const referrer = new URL(document.referrer);
      internal = referrer.origin === appRoot.origin && referrer.pathname.startsWith(appRoot.pathname);
    } catch (_) { /* No referrer means an address, bookmark, or app launch. */ }
    // A newly opened tab can inherit a copy of the opener's sessionStorage.
    const openedTab = Boolean(window.opener && history.length <= 1);
    return !internal || openedTab || !readVisit();
  }
  function mount() {
    inlinePlay = document.getElementById('aj-welcome-play');
    inlineStop = document.getElementById('aj-welcome-stop');
    inlineStatus = document.getElementById('aj-welcome-status');
    notice = document.createElement('aside');
    notice.className = 'aj-welcome-notice';
    notice.id = 'aj-welcome-notice';
    notice.hidden = true;
    notice.setAttribute('aria-label', 'JARVIS opening greeting');
    notice.innerHTML = `<div class="aj-welcome-notice-head"><span class="aj-welcome-notice-icon" aria-hidden="true">✦</span><div class="aj-welcome-notice-copy"><strong>JARVIS welcome</strong><p id="aj-welcome-notice-status" role="status" aria-live="polite">Preparing the JARVIS greeting…</p></div><button type="button" class="aj-welcome-notice-close" id="aj-welcome-notice-close" aria-label="Close JARVIS welcome">×</button></div><div class="aj-welcome-notice-actions"><button type="button" class="aj-welcome-notice-listen" id="aj-welcome-notice-play">▶ &nbsp;Listen</button><button type="button" class="aj-welcome-notice-stop" id="aj-welcome-notice-stop" hidden>Stop</button><details><summary>Read greeting</summary><p>${roman}</p><p>${durood}</p></details></div>`;
    document.body.appendChild(notice);
    noticeStatus = document.getElementById('aj-welcome-notice-status');
    noticePlay = document.getElementById('aj-welcome-notice-play');
    noticeStop = document.getElementById('aj-welcome-notice-stop');
    // Avoid announcing the same status twice on the homepage.
    if (inlineStatus) noticeStatus.setAttribute('aria-live', 'off');
    for (const button of [inlinePlay, noticePlay]) button?.addEventListener('click', () => start(true));
    for (const button of [inlineStop, noticeStop]) button?.addEventListener('click', stop);
    document.getElementById('aj-welcome-notice-close').addEventListener('click', () => {
      stop();
      writeVisit('dismissed');
      hideNotice();
    });
    // A greeting must never continue over a deliberate microphone or read-aloud
    // action on another existing assistant surface. These handlers do not
    // start voice input or send anything; they only stop this welcome.
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('#talkBtn,#micBtn,#readBtn,#speakBtn,#aiReadBtn,#ajDockMic,#ajDockRead,#ajDockPermission,#voiceTestBtn') : null;
      if (target && !target.disabled) interruptForAssistant();
    }, true);
    document.addEventListener('submit', event => {
      if (event.target instanceof Element && event.target.matches('#chatForm,#consoleForm,#composer,#ajDockForm')) interruptForAssistant();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target instanceof Element && event.target.matches('#prompt')) interruptForAssistant();
    }, true);

    if (isFreshEntry()) {
      if (document.hidden) {
        waitingForVisibility = true;
        setStatus('JARVIS will greet you when this tab is visible.');
      } else start(false);
    } else if (readVisit() === 'pending') {
      showNotice();
      setStatus('Tap Listen to hear your JARVIS welcome.');
    } else {
      setStatus('Tap Listen to hear the JARVIS welcome.');
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!notice) return;
    if (document.hidden) {
      wasHidden = true;
      hiddenWhilePlaying = Boolean(current?.started);
      if (current) {
        clearTimers(); stopCurrent(); controls(false); writeVisit('pending');
        setStatus('Welcome paused while this tab was hidden. Tap Listen to play it again.');
        showNotice();
      }
    } else if (waitingForVisibility || wasHidden) {
      waitingForVisibility = false;
      wasHidden = false;
      hiddenWhilePlaying = false;
      start(false);
    }
  });
  window.addEventListener('pagehide', () => {
    if (current) {
      const played = current.started;
      clearTimers(); stopCurrent(); controls(false);
      writeVisit(played ? 'played' : 'pending');
    } else if (hiddenWhilePlaying) {
      // A normal internal navigation may hide the document before pagehide.
      writeVisit('played');
    }
    hiddenWhilePlaying = false;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
