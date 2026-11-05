/* Voice Assistant add-on for Safety Inspection Form (Hindi + English)
 * Adds a mic button under every Deficiency box. Speak -> text is filled in ->
 * Gemini corrects mis-heard / mispronounced words using railway context.
 * Include AFTER the main <script> block:  <script src="voice-assistant.js"></script>
 */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const state = {
    lang: 'hi-IN',        // hi-IN also picks up English words well (Hinglish)
    output: 'asSpoken',   // 'asSpoken' | 'english'
    rec: null,
    activeBtn: null
  };

  // ---------- Gemini correction ----------
  async function correctTranscript(raw) {
    const toEnglish = state.output === 'english';
    const prompt = `You are a senior Indian Railways Safety Officer helping to fix a voice-dictated inspection remark.
The text below came from speech recognition (Hindi, English or mixed Hinglish) and may contain mis-heard words or mispronunciation errors.
Tasks:
- Fix wrongly recognised words using railway context (e.g. LC gate, OHE, SSP, TSS, loco pilot, ALP, points, signal, rail fracture, ballast, SEJ, interlocking, FOG signal, track circuit, Sr.DEN, Sr.DSTE).
- Fix grammar and sentence structure.
- ${toEnglish
      ? 'Output in clear, formal English railway-report language (translate Hindi/Hinglish to English).'
      : 'Keep the same language and script the speaker used (Hindi stays Hindi in Devanagari, English stays English, mixed stays mixed). Keep railway terms in English.'}
- Describe the observation only. Do NOT add recommendations or new facts.
- Return ONLY the corrected sentence, no quotes, no explanation.

Spoken text: "${raw}"`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        })
      }
    );
    const data = await res.json();
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return out || raw;
  }

  // ---------- UI helpers ----------
  function setBtn(btn, listening) {
    btn.textContent = listening ? '⏹ Stop' : '🎤 Speak';
    btn.style.background = listening
      ? 'linear-gradient(90deg,#d32f2f,#ff5252)'
      : 'linear-gradient(90deg,#00897b,#26a69a)';
  }

  function attachVoice(ta) {
    if (ta.dataset.voice) return;
    ta.dataset.voice = '1';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:4px 0 8px;';

    const mic = document.createElement('button');
    mic.type = 'button';
    mic.style.cssText = 'margin:0;padding:6px 14px;font-size:13px;color:#fff;';
    setBtn(mic, false);

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = '↩ Undo';
    undo.style.cssText = 'margin:0;padding:6px 12px;font-size:13px;background:#757575;display:none;';

    const status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:#4A148C;flex-basis:100%;';

    row.append(mic, undo, status);
    ta.after(row);

    let before = '';
    undo.onclick = () => {
      ta.value = before;
      autoGrowTextarea(ta);
      undo.style.display = 'none';
      status.textContent = 'Reverted.';
    };

    mic.onclick = () => {
      if (!SR) return showError('Voice input needs Chrome / Edge (Android or desktop).');
      if (state.rec && state.activeBtn === mic) { state.rec.stop(); return; }
      if (state.rec) state.rec.stop();

      const rec = new SR();
      rec.lang = state.lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      state.rec = rec;
      state.activeBtn = mic;

      let finalText = '';
      before = ta.value;
      setBtn(mic, true);
      status.textContent = 'Listening… speak now';

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t + ' ';
          else interim += t;
        }
        status.textContent = '🎙 ' + (finalText + interim).trim();
      };

      rec.onerror = (e) => {
        const msg = e.error === 'not-allowed' ? 'Microphone permission denied.'
                  : e.error === 'no-speech' ? 'Did not hear anything. Try again.'
                  : 'Voice error: ' + e.error;
        status.textContent = msg;
      };

      rec.onend = async () => {
        setBtn(mic, false);
        state.rec = null; state.activeBtn = null;
        const raw = finalText.trim();
        if (!raw) return;
        status.textContent = 'Correcting sentence…';
        let fixed = raw;
        try { fixed = await correctTranscript(raw); }
        catch (err) { console.error(err); status.textContent = 'Correction failed, raw text used.'; }
        ta.value = (before ? before.trim() + ' ' : '') + fixed;
        autoGrowTextarea(ta);
        undo.style.display = 'inline-block';
        status.textContent = fixed !== raw ? `Heard: "${raw}" → corrected.` : 'Done.';
      };

      try { rec.start(); } catch (err) { console.error(err); }
    };
  }

  function buildControlBar(container) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#e0f2f1;border:1px solid #80cbc4;border-radius:10px;padding:10px;margin-bottom:12px;';
    bar.innerHTML = `
      <strong style="color:#00695c;font-size:14px;">🎤 Voice Assistant</strong>
      <select id="voiceLang" style="width:auto;margin:0;padding:6px 10px;font-size:13px;">
        <option value="hi-IN">हिंदी / Hinglish</option>
        <option value="en-IN">English (India)</option>
      </select>
      <select id="voiceOutput" style="width:auto;margin:0;padding:6px 10px;font-size:13px;">
        <option value="asSpoken">Keep as spoken</option>
        <option value="english">Convert to English</option>
      </select>
      <span style="font-size:12px;color:#00695c;flex-basis:100%;">
        Tap "Speak" under any deficiency. Wrong / mispronounced words are auto-corrected.
      </span>`;
    container.parentNode.insertBefore(bar, container);
    bar.querySelector('#voiceLang').onchange = e => state.lang = e.target.value;
    bar.querySelector('#voiceOutput').onchange = e => state.output = e.target.value;
  }

  function init() {
    const container = document.getElementById('deficiencyContainer');
    if (!container) return;
    buildControlBar(container);
    container.querySelectorAll('textarea').forEach(attachVoice);
    // Fields are re-created (type change, Add More, Edit) -> watch for them
    new MutationObserver(() => {
      container.querySelectorAll('textarea').forEach(attachVoice);
    }).observe(container, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
