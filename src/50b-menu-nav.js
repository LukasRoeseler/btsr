  // ============================ MENUENAVIGATION (Phase 13, WIP) ======================
  //
  // BESTELLT: D-Pad/Pfeiltasten navigieren im Cockpit und in den Optionen, X/Enter
  // bestaetigt oder waehlt einen Regler an.
  //
  // ENG GESCHNITTEN, aus einer bereits gemachten Erfahrung dieses Projekts: eine
  // FRUEHERE, allgemeine Menuenavigation (siehe der Kommentar bei pollGamepad() in
  // 90-ghosts.js) griff auf jedem Tab und jedem fokussierbaren Element und wurde deshalb
  // wieder ausgebaut - eine Fehlbedienung verstellte einen Regler, den niemand im Blick
  // hatte. Diese Fassung wirkt NUR auf dem Optionen-Tab (menuNavActive() prueft das
  // selbst), und ein Regler AENDERT SICH NICHT durch den blossen Fokus: er muss erst mit
  // der Waehltaste "angewaehlt" werden (menuNavArmed), bevor links/rechts seinen Wert
  // veraendert. Cockpit-Schirme (Box, Renneinstellungen) haben ihre eigene, laengst
  // gemessene Zeilenauswahl (pitScreenPad/raceScreenPad, cockpitScreenWaehlen) und
  // werden hier nicht verdoppelt - flagTasteTick() und die Tastatur (30-input.js) reihen
  // menuNavActivate() nur als NEUE, erste Stufe vor die bestehende Kette ein.

  let menuNavIndex = 0;
  let menuNavArmed = false;
  let menuNavContextKey = null;
  let menuNavHoldStart = null, menuNavHoldDir = null, menuNavLastStep = 0;
  const MENU_NAV_HOLD_DELAY_MS = 400;
  const MENU_NAV_HOLD_REPEAT_MS = 120;

  // Der Container, dessen Zeilen gerade gelten: die offene Unterseite, oder - wenn keine
  // offen ist - die Kachelseite selbst. null ausserhalb des Optionen-Tabs.
  function menuNavContainer() {
    const tab = $('tab-options');
    if (!tab || !tab.classList.contains('active')) return null;
    const openSub = tab.querySelector('.subpage.on');
    return openSub || $('sub-home-options');
  }

  // EINZELN abgefragt und nicht als eine Komma-Liste: querySelector() mit mehreren
  // durch Komma getrennten Mustern liefert das erste Element in DOKUMENT-Reihenfolge,
  // nicht das erste PASSENDE Muster in der Liste - eine Reglerzeile mit einem "-"-Knopf
  // VOR dem eigentlichen input[range] lieferte deshalb den Knopf, nicht den Regler.
  function menuNavControlFor(row) {
    return row.querySelector('input[type="checkbox"]')
      || row.querySelector('input[type="range"]')
      || row.querySelector('select')
      || row.querySelector('input[type="number"], input[type="text"]')
      || row.querySelector('button:not(.opt-label button)');
  }

  // DOM-Reihenfolge ist Bildschirm-Reihenfolge: weder .opt-row noch .misc-tile werden
  // per CSS umsortiert (siehe die Recherche zu dieser Phase). Nur SICHTBARE Zeilen
  // zaehlen - offsetParent ist null bei jedem display:none, egal ob ueber eine
  // Media-Query, ein bedingtes Feature oder eine geschlossene Unterseite.
  function menuNavRows() {
    const host = menuNavContainer();
    if (!host) return [];
    if (host.id === 'sub-home-options') {
      return [...host.querySelectorAll('.misc-tile')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, kind: 'tile', control: el }));
    }
    const rows = [];
    const back = host.querySelector('.subpage-back');
    if (back && back.offsetParent !== null) rows.push({ el: back, kind: 'button', control: back });
    [...host.querySelectorAll('.opt-row')].forEach((row) => {
      if (row.offsetParent === null) return;
      const control = menuNavControlFor(row);
      if (!control) return;
      let kind = 'button';
      if (control.type === 'checkbox') kind = 'toggle';
      else if (control.type === 'range') kind = 'range';
      else if (control.tagName === 'SELECT') kind = 'select';
      rows.push({ el: row, kind, control });
    });
    return rows;
  }

  function menuNavContextNow() {
    const host = menuNavContainer();
    return host ? host.id : null;
  }

  // Wechselt der Kontext (Unterseite auf/zu, Kachel geoeffnet, Tab verlassen), faengt
  // ganz von vorn an - ein gemerkter Index aus einer anderen Zeilenliste zeigt sonst auf
  // eine zufaellige Stelle, sobald man zurueckkommt.
  function menuNavEnsureContext() {
    const key = menuNavContextNow();
    if (key !== menuNavContextKey) {
      // Den Optionen-Tab verlassen: menuNavRender() scrollt document.body (nicht das
      // Fenster) fuer jede fokussierte Zeile, und dieser Bildlauf blieb sonst stehen -
      // ein anderer Tab konnte so scheinbar grundlos mitten im Bild aufschlagen, obwohl
      // niemand ihn dorthin gescrollt hat.
      if (menuNavContextKey !== null && key === null) document.body.scrollTop = 0;
      menuNavContextKey = key;
      menuNavIndex = 0;
      menuNavArmed = false;
    }
  }

  function menuNavActive() {
    menuNavEnsureContext();
    return menuNavRows().length > 0;
  }

  function menuNavRender() {
    document.querySelectorAll('.menu-nav-sel').forEach((el) => {
      el.classList.remove('menu-nav-sel', 'menu-nav-armed');
    });
    const rows = menuNavRows();
    if (!rows.length) return;
    menuNavIndex = ((menuNavIndex % rows.length) + rows.length) % rows.length;
    const row = rows[menuNavIndex];
    row.el.classList.add('menu-nav-sel');
    if (menuNavArmed) row.el.classList.add('menu-nav-armed');
    if (typeof row.el.scrollIntoView === 'function') row.el.scrollIntoView({ block: 'nearest' });
  }

  function menuNavMove(dir) {
    menuNavEnsureContext();
    const rows = menuNavRows();
    if (!rows.length) return;
    menuNavArmed = false;
    menuNavIndex = ((menuNavIndex + (dir === 'up' ? -1 : 1)) % rows.length + rows.length) % rows.length;
    menuNavRender();
  }

  // X/Enter auf der fokussierten Zeile: Kachel/Knopf -> klicken, Kontrollkaestchen ->
  // umschalten, Regler/Auswahlfeld -> an- oder abwaehlen (kein Klick, kein Wertwechsel -
  // das macht erst menuNavAdjust()).
  function menuNavActivate() {
    menuNavEnsureContext();
    const rows = menuNavRows();
    if (!rows.length) return;
    const row = rows[menuNavIndex];
    if (row.kind === 'range' || row.kind === 'select') {
      menuNavArmed = !menuNavArmed;
      menuNavRender();
      return;
    }
    menuNavArmed = false;
    row.control.click();
    // Ein Klick kann den Kontext aendern (eine Kachel oeffnet ihre Unterseite) -
    // menuNavEnsureContext() faengt das ab, bevor neu gezeichnet wird.
    menuNavEnsureContext();
    menuNavRender();
  }

  // links/rechts auf einer ANGEWAEHLTEN Zeile. Gibt zurueck, ob sie das gebraucht hat -
  // false heisst "nichts angewaehlt", und dann darf der Aufrufer die Taste fuer etwas
  // anderes nehmen (Tabwechsel, Cockpit-Schirm blaettern).
  function menuNavAdjust(dir) {
    menuNavEnsureContext();
    if (!menuNavArmed) return false;
    const rows = menuNavRows();
    if (!rows.length) return false;
    const row = rows[menuNavIndex];
    if (row.kind === 'range') {
      if (dir === 'left') row.control.stepDown(); else row.control.stepUp();
      row.control.dispatchEvent(new Event('input', { bubbles: true }));
      row.control.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (row.kind === 'select') {
      const n = row.control.options.length;
      const i0 = row.control.selectedIndex;
      const i1 = dir === 'left' ? Math.max(0, i0 - 1) : Math.min(n - 1, i0 + 1);
      if (i1 !== i0) {
        row.control.selectedIndex = i1;
        row.control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      return false;
    }
    menuNavRender();
    return true;
  }

  // Gamepad-Fassung von menuNavAdjust(): bekommt JEDEN Takt den rohen Tastendruck
  // (nicht nur die steigende Flanke), damit Halten wiederholt - erste Stufe sofort,
  // danach alle MENU_NAV_HOLD_REPEAT_MS. Tastatur braucht das nicht: dort erledigt die
  // vom Betriebssystem ohnehin wiederholten keydown-Ereignisse dasselbe (siehe
  // 30-input.js).
  function menuNavAdjustPad(dir, held) {
    if (!held) {
      if (menuNavHoldDir === dir) { menuNavHoldStart = null; menuNavHoldDir = null; }
      return;
    }
    const now = Date.now();
    if (menuNavHoldDir !== dir) {
      menuNavHoldDir = dir;
      menuNavHoldStart = now;
      menuNavLastStep = now;
      menuNavAdjust(dir);
      return;
    }
    if (now - menuNavHoldStart >= MENU_NAV_HOLD_DELAY_MS
        && now - menuNavLastStep >= MENU_NAV_HOLD_REPEAT_MS) {
      menuNavLastStep = now;
      menuNavAdjust(dir);
    }
  }

  // Tabwechsel per rohem Steuerkreuz (nicht belegbar - siehe die Begruendung bei
  // pollGamepad()). Ueberspringt versteckte Tab-Knoepfe (data-parent, hidden) genau wie
  // die sichtbare Leiste sie ueberspringt.
  function menuNavTabWechsel(d) {
    const buttons = [...document.querySelectorAll('.tab-btn')].filter((b) => b.offsetParent !== null);
    if (!buttons.length) return;
    const now = buttons.findIndex((b) => b.classList.contains('active'));
    const i = (((now < 0 ? 0 : now) + (d >= 0 ? 1 : -1)) % buttons.length + buttons.length) % buttons.length;
    buttons[i].click();
  }

