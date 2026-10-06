  // =========================================================================
  // Ladeanimation: drei Streckenteile, die nacheinander aufleuchten (v0.9.42)
  // =========================================================================
  // BESTELLT: "Zeige im Editorfeld eine Ladeanimation (zB ein sich drehendes Carrera Hybrid
  // Streckenteil, oder durchlaufende Streckenteile [gerade, kurve, haarnadel]) waehrend der
  // Zufallsalgorithmus laeuft. Zeige ebenfalls eine Ladeanimation (ggf dieselbe) waehrend der
  // Host das Rennen fuer alle gestartet hat und auf Rueckmeldung der anderen Handys wartet."
  //
  // Gerade, 60-Grad-Kurve und Haarnadel im Stil der Originalteile: schwarze Fahrbahn,
  // weisser Rand mit roten Pfeilfeldern. Nur transform und opacity werden animiert - die
  // laufen im Compositor weiter, auch wenn der Hauptfaden kurz rechnet.
  const LADE_TEILE = [
    'M20 38 V2',                                   // Gerade
    'M10 38 V26 A15 15 0 0 1 25 11 H38',           // Kurve
    'M9 38 V19 A11 11 0 0 1 31 19 V38',            // Haarnadel
  ];
  function ladeTeilSvg(d) {
    return '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<path d="' + d + '" fill="none" stroke="#f3f5f8" stroke-width="16"/>'
      + '<path d="' + d + '" fill="none" stroke="#ff4d22" stroke-width="16" stroke-dasharray="3.4 2.6"/>'
      + '<path d="' + d + '" fill="none" stroke="#2b303a" stroke-width="10"/>'
      + '</svg>';
  }
  function ladeAnimationHtml(text) {
    return '<div class="lade-teile">' + LADE_TEILE.map(ladeTeilSvg).join('') + '</div>'
      + (text ? '<div class="lade-text">' + String(text).replace(/</g, '&lt;') + '</div>' : '');
  }
  // Als Einblendung UEBER einem Feld (Editor). Rueckgabe: das Element, .remove() beendet sie.
  function ladeAnimationZeigen(host, text) {
    const el = document.createElement('div');
    el.className = 'lade-ueber';
    el.setAttribute('role', 'status');
    el.innerHTML = ladeAnimationHtml(text);
    host.classList.add('lade-traeger');
    host.appendChild(el);
    const weg = el.remove.bind(el);
    el.remove = () => { weg(); if (!host.querySelector('.lade-ueber')) host.classList.remove('lade-traeger'); };
    return el;
  }
  // Fest in einem Platzhalter (Bereitschaftsschirm): an/aus, ohne bei jedem Abruf neu zu bauen.
  function ladeAnimationSetzen(slot, an) {
    if (!slot) return;
    if (an && !slot.firstChild) slot.innerHTML = ladeAnimationHtml('');
    if (!an && slot.firstChild) slot.innerHTML = '';
    slot.hidden = !an;
  }
