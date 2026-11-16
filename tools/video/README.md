# Videojuhendite tegemine

Mootor `engine.js` filmib simulatsiooni Playwrightiga (Chromium) kaader-kaadrilt: lehele süstitakse virtuaalne kell (`performance.now` ja `requestAnimationFrame` asendatud), kursor, tiitrid, esiletõst ja pealkirjakaardid on lehe peal kiht. Pilt kodeeritakse ffmpeg-iga (1920×1080, 30 fps, H.264), kõneklipid pannakse iga stseeni algusesse (+0,4 s).

Praegu on siin magnetvälja stsenaariumid (`opetajale.js`, `opilasele.js`) ja kõnetekstid (`magnetvali_clips.json`). Mootoris on lehe aadress `magnetvali/index.html`; teise simulatsiooni jaoks muuda `URL` ja tee uued stsenaariumid.

1. Kõne: Neurokõne (TartuNLP, kõneleja Mari). Klipid `<id>.wav` kausta `tools/video/clips/` (repos neid ei hoita). Claude'i pilvest API-le ei pääse – klipid tehakse Claude'i rakenduse sisseehitatud brauseris lehel neurokone.ee (fetch API-le, kokku zip, allalaadimine), zip tõstetakse kausta `Dokumendid\Neurokõne`, mis ühendatakse sessiooniga.
2. `node engine.js opetajale.js ../../magnetvali/video/opetajale.mp4` (Playwrighti tee on mootoris `/opt/npm-tools/node_modules/playwright`).
3. Stseeni pikkus = max(toimingud, kõne + 0,9 s); logi `<väljund>.log.json` näitab stseenide algusi ja kõne lõppe.
4. Eelvaatepilt: `ffmpeg -ss 3 -i opetajale.mp4 -frames:v 1 -vf scale=960:540 opetajale.jpg`.
