#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Versionsnummer aus der Git-Historie in index.html schreiben.

Format:  0.<Woche>.<Push>
  Woche  vollendete 7-Tage-Bloecke seit dem ersten Commit
  Push   Commits seit Beginn des laufenden Blocks, einschliesslich des gerade
         entstehenden - deshalb +1

Vor jedem Commit aufrufen:

    python tools/bump_version.py && git add index.html

Warum aus der Historie und nicht von Hand: eine Zahl, die man selbst pflegt, ist nach dem
dritten Push falsch. Der 7-Tage-Block wird ab dem ERSTEN Commit gezaehlt, nicht ab Montag -
sonst stimmen die beiden Stellen nicht zueinander, weil die Wochenzahl ebenfalls vom
Projektbeginn aus laeuft.
"""
import datetime
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TARGET = os.path.join(REPO, 'index.html')


def git(*args):
    return subprocess.check_output(['git'] + list(args), cwd=REPO, text=True).strip()


def version():
    first = git('log', '--reverse', '--format=%aI').splitlines()[0]
    start = datetime.datetime.fromisoformat(first).date()
    today = datetime.date.today()
    week = (today - start).days // 7
    block = start + datetime.timedelta(days=week * 7)
    n = int(git('rev-list', '--count', 'HEAD',
                '--since=%s 00:00:00' % block.isoformat()))
    # +1, weil der Commit, fuer den diese Nummer gilt, noch nicht existiert.
    return '0.%d.%d' % (week, n + 1), start, block


def main():
    v, start, block = version()
    s = io.open(TARGET, encoding='utf-8').read()
    pat = re.compile(r'(<span id="app-version">)[^<]*(</span>)')
    if not pat.search(s):
        print('FEHLER: <span id="app-version"> nicht in index.html gefunden', file=sys.stderr)
        return 1
    new = pat.sub(lambda m: m.group(1) + v + m.group(2), s, count=1)
    if new == s:
        print('Version unveraendert: %s' % v)
        return 0
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(new)
    print('Version %s  (Projektbeginn %s, Block ab %s)' % (v, start, block))
    return 0


if __name__ == '__main__':
    sys.exit(main())
