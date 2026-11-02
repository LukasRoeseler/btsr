  // =========================================================================
  // Ladeanimation: ein Streckenteil, das sich dreht (v0.9.45)
  // =========================================================================
  // BESTELLT (v0.9.42): eine Ladeanimation im Editor, waehrend der Zufallsalgorithmus laeuft,
  // und im Mehrspieler, waehrend auf die anderen Handys gewartet wird.
  //
  // v0.9.45 BESTELLT: "Nimm ein huebsch gerendertes Gerade-Streckenteil und zeig an, wie es
  // sich im Uhrzeigersinn dreht. Nach einer Drehung wird es durch eine Rechtskurve ersetzt,
  // dann wieder von vorne. Eine Drehung sollte ca. 500 ms dauern."
  //
  // Die Teile zeichnet DERSELBE Zeichner wie den Editor (renderTrackPreview mit echt: true),
  // also mit Randstreifen, Pfeilen und Steckzapfen der Originalteile - kein zweites Aussehen.
  // Animiert wird nur transform und opacity: das laeuft im Compositor weiter, auch wenn der
  // Hauptfaden kurz rechnet. Zwei Ebenen, beide drehen sich in 500 ms einmal; die eine ist in
  // der ersten, die andere in der zweiten Haelfte eines 1-s-Takts sichtbar.
  // v1.3.5: aus teilBildSvg() (60-track.js) - dasselbe gemerkte Bild wie in der Teileleiste
  // des Editors, immer nach oben gerichtet. Scheitert es (zu frueh beim Laden), wird nichts
  // gemerkt und beim naechsten Mal neu versucht; vorher blieb dann dauerhaft ein leeres Bild.
  function ladeTeileSvg() {
    let gerade = '';
    try { gerade = teilBildSvg(TILE_TYPE.STRAIGHT, 'lade-teil'); } catch (e) { gerade = ''; }
    return [gerade];
  }
  function ladeAnimationHtml(text) {
    const [gerade] = ladeTeileSvg();
    return '<div class="lade-dreh" aria-hidden="true">'
      + '<div class="lade-ebene lade-a">' + gerade + '</div></div>'
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
