  // Prioritaet gilt nur fuer wartende Ansagen, niemals fuer laufende Saetze.
  class RennAnsagenQueue {
    constructor(blockiert, fehler) {
      this.blockiert = blockiert; this.fehler = fehler;
      this.jobs = []; this.aktiv = null; this.timer = null; this.generation = 0;
      this.folge = 0; this.ruheBis = 0;
    }
    einreihen(art, prioritaet, spielen, erlaubt = () => true) {
      this.jobs.push({ art, prioritaet, spielen, erlaubt, nr: this.folge++ });
      this.wecken(); return true;
    }
    wecken(ms = 0) {
      if (this.timer !== null || this.aktiv) return;
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, ms);
    }
    async pump() {
      if (this.aktiv) return;
      this.jobs = this.jobs.filter(j => j.erlaubt());
      if (!this.jobs.length) return;
      if (this.blockiert() || performance.now() < this.ruheBis) { this.wecken(50); return; }
      this.jobs.sort((a, b) => b.prioritaet - a.prioritaet || a.nr - b.nr);
      const job = this.jobs.shift(), token = this.generation;
      this.aktiv = job;
      try { await job.spielen(() => token === this.generation && job.erlaubt()); }
      catch (err) { this.fehler(err); }
      finally {
        if (token === this.generation) {
          this.aktiv = null; this.ruheBis = performance.now() + 300; this.wecken();
        }
      }
    }
    reset() {
      this.generation++; this.jobs = []; this.aktiv = null; this.ruheBis = 0;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    }
    get beschaeftigt() { return !!this.aktiv || this.jobs.some(j => j.erlaubt()); }
  }
  let ansagenAktuellStop = null;
  const rennAnsagen = new RennAnsagenQueue(
    () => !soundEnabled || rennPauseAktiv() || rennstandBeschaeftigt()
      || rennintroAktiv || lapAnsageBeschaeftigt()
      || performance.now() < lapAnsageRuheBis,
    err => log('Ansage fehlgeschlagen: ' + err.message, 'info'));
  function ansagenReset() {
    rennAnsagen.reset();
    if (ansagenAktuellStop) ansagenAktuellStop();
    ansagenAktuellStop = null;
  }
  function ansagenWarten() { return rennAnsagen.beschaeftigt; }
  function ansagenEinreihen(art, text, schluessel, ms, best) {
    if (!ansageAn[art] || !soundEnabled) return false;
    const spr = lang;
    return rennAnsagen.einreihen(art, art === 'lap' ? 0 : 15, async gueltig => {
      if (!gueltig()) return;
      if (art === 'lap' && !('speechSynthesis' in window)) {
        const satz = await rennstandClipsLaden(spr, true);
        if (!gueltig()) return;
        const folge = lapClipFolge(ms, best).map(k => satz && satz['n:' + k]);
        if (folge.every(Boolean)) await ansagenPufferSpielen(folge);
        else log('Rundenzeit: Aufnahmen fehlen.', 'info');
      } else if (art !== 'lap') {
        const satz = voiceBuffers[schluessel || art];
        const puffer = satz && (satz[spr] || satz.en);
        if (puffer) await ansagenPufferSpielen([puffer]);
        else await ansagenTextSpielen(text, spr);
      } else await ansagenTextSpielen(text, spr);
    }, () => !!ansageAn[art] && soundEnabled && lang === spr);
  }
  function ansagenPufferSpielen(puffer, optionen = {}) {
    if (!audioCtx || !soundEnabled || !puffer.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const quellen = []; let offen = puffer.length, fertig = false, hallTimer = null;
      // Nur opt-in: bestehende Runden-/Warnansagen behalten ihren Audiopfad.
      // Rennereignisse verwenden denselben Hall, Pegel und dasselbe Tempo wie das Intro.
      const stadion = optionen.stadion === true;
      const tempo = stadion ? rennstandTempoWert(rennstandTempo) : 1;
      const ende = (ok = true) => {
        if (fertig) return; fertig = true;
        if (hallTimer !== null) clearTimeout(hallTimer);
        if (ansagenAktuellStop === stop) ansagenAktuellStop = null;
        for (const q of quellen) { try { q.disconnect(); } catch (e) {} }
        lapAnsageBeendet(); resolve(ok);
      };
      const stop = () => {
        for (const q of quellen) { q.onended = null; try { q.stop(); } catch (e) {} }
        ende(false);
      };
      ansagenAktuellStop = stop;
      try {
        const ziel = stadion ? rennstandGain() : audioCtx.destination;
        let zeit = audioCtx.currentTime + 0.03;
        for (const buffer of puffer) {
          const q = audioCtx.createBufferSource(); q.buffer = buffer;
          q.playbackRate.value = tempo;
          q.connect(ziel); quellen.push(q);
          q.onended = () => {
            if (--offen !== 0) return;
            // Convolver klingt weiter, wenn die letzte Quelle schon beendet ist.
            // Queue und Stop-Handler bleiben bis zum Hallende aktiv, damit keine
            // Rundenzeit/Rennstandansage in die ausklingende Ereignismeldung faellt.
            const hallMs = stadion && rennstandHall > 0 ? RENNSTAND_HALL_DAUER * 1000 : 0;
            if (hallMs > 0) hallTimer = setTimeout(() => ende(), hallMs);
            else ende();
          };
          q.start(zeit); zeit += buffer.duration / tempo + 0.055;
        }
        announceCalls++;
      } catch (err) { log('Ansage-Wiedergabe: ' + err.message, 'info'); stop(); }
    });
  }
  function ansagenTextSpielen(text, spr, maxMs = 120000) {
    if (!('speechSynthesis' in window)) {
      log('Ansage: Sprachclips fehlen und keine Geraetestimme verfuegbar.', 'info');
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      let fertig = false, timer = null;
      const start = performance.now();
      const u = new SpeechSynthesisUtterance(text);
      const ende = (ok = true) => {
        if (fertig) return; fertig = true;
        if (timer !== null) clearTimeout(timer);
        if (ansagenAktuellStop === stop) ansagenAktuellStop = null;
        lapAnsageBeendet(); resolve(ok);
      };
      const stop = () => { window.speechSynthesis.cancel(); ende(false); };
      ansagenAktuellStop = stop;
      u.lang = spr === 'de' ? 'de-DE' : 'en-US'; u.rate = 1.15;
      u.onend = () => ende();
      u.onerror = ev => { log('Ansage: ' + (ev.error || 'Stimmenfehler'), 'info'); ende(false); };
      // Kein onend: nur freigeben, wenn die Stimme tatsaechlich nicht mehr spricht.
      const pruefen = () => {
        if (performance.now() - start >= maxMs) {
          log('Ansage: Geraetestimme meldet kein Ende; nach 120 s abgebrochen. Warteschlange freigegeben.', 'info');
          stop(); return;
        }
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) timer = setTimeout(pruefen, 500);
        else ende();
      };
      try { window.speechSynthesis.speak(u); announceCalls++; timer = setTimeout(pruefen, Math.min(maxMs, 5000 + text.length * 120)); }
      catch (err) { log('Ansage: ' + err.message, 'info'); ende(false); }
    });
  }
