  // ============================ STRECKE AUS DER AUFNAHME LERNEN (WIP) ================
  //
  // BESTELLT: "... vielleicht, dass das Auto mehrere Runden faehrt und dann durch die
  // Aufzeichnungen eine Strecke erschlossen und gezeichnet wird." Kein neuer Fahrweg und
  // kein neues Lernverfahren - beide gibt es schon und beide sind fuer sich gemessen:
  // der Makro-Rekorder (50-drive.js) spielt Lenk- und Gaswerte exakt erneut ab, und das
  // Hintergrund-Lernen (ghostCfg.learn, 60-track.js/90-ghosts.js) baut aus den echten,
  // vom Auto gemeldeten Streckencodes ein Layout zusammen - fuer JEDES Auto, das gerade
  // faehrt, gleich ob von Hand, als Ghost oder eben per Wiedergabe. Dieser Baustein
  // verbindet nur beide: Lernen einschalten, Zustand zuruecksetzen, Aufnahme abspielen,
  // Ergebnis zeichnen.

  function macroLearnRefreshButton() {
    const btn = $('btn-macro-learn-track');
    if (btn) btn.disabled = macro.length === 0 || recording || playing;
  }
  // Kein eigener Zaehler: derselbe macro.length/recording/playing, den btn-play schon
  // benutzt, nur nach jeder Aktion erneut geprueft.
  ['btn-record', 'btn-play', 'btn-stop-play', 'btn-load-macro'].forEach((id) => {
    if ($(id)) $(id).addEventListener('click', macroLearnRefreshButton);
  });
  if ($('macro-import')) $('macro-import').addEventListener('change', macroLearnRefreshButton);
  macroLearnRefreshButton();

  let macroLearnVorherigesLernen = null;

  function macroLearnKarteZeichnen() {
    const halter = $('macro-learn-karte');
    if (!halter) return;
    halter.innerHTML = (currentTrackTiles && currentTrackTiles.length >= 3)
      ? renderTrackPreview(currentTrackTiles, null, {}).html : '';
  }

  function macroLearnFertig() {
    if (macroLearnVorherigesLernen !== null) {
      ghostCfg.learn = macroLearnVorherigesLernen;
      macroLearnVorherigesLernen = null;
    }
    macroLearnKarteZeichnen();
    const status = $('macro-learn-status');
    if (status) {
      status.textContent = (currentTrackTiles && currentTrackTiles.length >= 3)
        ? t('__N__ Teile gelernt.').replace('__N__', currentTrackTiles.length)
        : t('Keine geschlossene Runde erkannt - nochmal versuchen.');
    }
    macroLearnRefreshButton();
  }

  if ($('btn-macro-learn-track')) {
    $('btn-macro-learn-track').addEventListener('click', () => {
      if (macro.length === 0 || recording || playing) return;
      macroLearnVorherigesLernen = ghostCfg.learn;
      ghostCfg.learn = true;
      learnReset();
      currentTrackTiles = freshTrackTiles();
      macroLearnKarteZeichnen();
      const status = $('macro-learn-status');
      if (status) status.textContent = t('lernt…');
      // Endlosschleife wuerde stopPlayback() und damit macroPlaybackDoneCallback nie
      // erreichen - fuer diesen einen Lauf immer genau einmal abspielen.
      if ($('chk-loop')) $('chk-loop').checked = false;
      playing = true; // dieselbe Sperre wie beim btn-play-Klick, siehe playbackLocked()
      $('btn-play').disabled = true;
      $('btn-stop-play').disabled = false;
      macroLearnRefreshButton(); // playing ist jetzt true - auch dieser Knopf sperrt sich
      macroPlaybackDoneCallback = macroLearnFertig;
      runPlayback();
    });
  }

