# CLAUDE.md – Riksväg 7 (github.com/Jmai80/riksvag7)

Startpunkten för en ny Claude Code-session. Läs hela filen och sedan `docs/HANDOFF.md`.

Senast uppdaterad 30 oktober 2026, version **1.0**: första racet Ekeby–Sjuby med tre valbara bilar och fem datorförare.

## 1. Projektet på en minut

- **Riksväg 7** är ett racingspel i webbläsaren, mobilen först. Syskon till **GTA 7** (github.com/Jmai80/gta7) och byggt på samma sätt: **three.js 0.184 från jsDelivr** via `src/three.js`, vanliga ES-moduler, **inget byggsteg**, allt procedurellt (inga bild-, modell- eller ljudfiler; typsnittet ligger i `fonts/`).
- **Bilarna rör sig och styrs som i GTA 7.** `src/vehicle.js` är GTA 7:s fysik (acceleration, broms, grepp, sladd, handbroms, hastighetskänslig styrning, kollisioner) och `Game.drive()` i `src/game.js` är GTA 7:s mappning från spak/pedaler/tangentbord/handkontroll. Ändra inte känslan utan att användaren ber om det.
- **Man kan inte lämna bilen** och **inte gå in i byggnader**: det finns ingen kliv-ur-knapp eller kod för det, och alla hus är solida kollisioner. Testerna kontrollerar båda.
- Simuleringen (bana, fysik, AI, race) är ren JavaScript utan three.js och testas i Node. Grafiken är separat.
- Spelet ligger på **https://jmai80.github.io/riksvag7/** (GitHub Pages från `main`, repots rot).

## 2. Användaren och arbetssättet (samma som i GTA 7)

- Svara på **svenska**. Kod och kommentarer på engelska. All text i spelet på svenska.
- Användaren provspelar på mobilen via GitHub Pages: **varje leverans ska hamna på `main`**.
- Commit: första raden `Riksväg 7 vX.Y: kort beskrivning på svenska`, tom rad, punktlista, sist sessionens attributionsrader.
- **Höj versionen vid varje leverans:** `package.json`, `index.html` (`#ver` på startskärmen), `VERSION` i `src/main.js`, README och den här filen.
- Leverera en kort sammanfattning i spelartermer och ett **skärmdumpsark** (telefonbilder 390×844 med gula bildtexter, #ffcf33, Big Shoulders Display).
- Användaren bestämmer i stora drag och låter oss hitta på detaljerna. Användaren läser inte kod.

## 3. Kom igång

```sh
npm install --no-save three@0.184.0          # three.js lokalt – bara för webbläsartesterna
npm test                                     # Node-testerna, ~2 s: "All checks passed"
(nohup python3 -m http.server 8765 --directory "$PWD" > /dev/null 2>&1 &)
mkdir -p test/shots
python3 test/browser/smoke.py phone          # titel → bilval → race på autopilot, skärmdumpar
python3 test/browser/full.py phone falk      # hela racet till resultatlistan
python3 test/browser/views.py v 300 2600     # stora bilder från platser längs vägen (meter från start)
python3 test/browser/studio.py car "car=lo&paint=orange&yaw=0.8"   # fotostudio för bilmodellerna (test/studio.html)
```

- Webbläsartesterna kör Chromium med SwiftShader. `test/browser/cdn.py` serverar three.js från `node_modules` (sandlådan når inte jsDelivr).
- Sidan öppnas med **`?manual`**: då står spelklockan still och testerna driver den med `window.__rv.run(sekunder)` (simulerar utan att rita, ritar sista bilden). Utan det går mjukvaru-WebGL för långsamt.
- `window.__rv`: `game`, `view`, `track`, `world`, `state`, `toSelect()`, `setCar(typ)`, `startRace()`, `pause(on)`, `run(sek, steg)`, `until(villkor, maxSek)` (stega tills villkoret gäller, rita sedan en bild). `test/browser/sheet.py` tar skärmdumpsarkets bilder.
- Låt autopiloten köra spelarens bil: `g.player.auto = new Driver(g, g.player, { skill: 1, base: 2, dist: g.player.dist, player: true })` (se `test/browser/full.py`).

## 4. Karta över koden

| Fil | Vad |
|---|---|
| `index.html` | All CSS och alla overlays: laddning, titel (vägskylten), bilval, HUD, touchknappar, paus, resultat. |
| `src/main.js` | Skärmarna och loopen (fast 60 Hz-simulering), kameran per skärm, inställningar och rekord i `localStorage`, `window.__rv`. |
| `src/track.js` | Vägen (`CORNERS`: punkter med kurvradie, samplad var 2 m), zonerna (`ekeby`, `farm`, `forest`, `lake`/`bridge`, `mellby`, `ridge`, `sjuby`, `start`, `finish`, `bumps`), höjdprofilen, landskapet (`natural`, `height`), `groundHeight`/`surfaceAt` för fysiken, `nearest`/`project`. |
| `src/world.js` | Allt längs vägen som data + kollisionsgriden: `buildings`, `trees`, `fields`, `rails`, `lamps`, `poles`, `posts`, `signs`, `gantries`, `crowd`, `rocks`, `bales`, `flags`, `docks`. |
| `src/vehicle.js`, `src/collide.js` | Bilfysiken (GTA 7) och kollisionsgriden. |
| `src/cars.js` | De tre bilarnas siffror (`CAR_TYPES`), lackerna (`PAINTS`), växellådan (`GEARS`, `gearOf`), `zeroTo100`, `topSpeed`. |
| `src/game.js` | Racet: startgrid, intro → nedräkning → race → mål, placeringar, `standings()`, fel håll, för långt ut, `resetPlayer()`. |
| `src/ai.js` | Datorförarna (`RIVALS`, `Driver`): racinglinje, omkörningar, gummiband, respawn. |
| `src/carmodel.js` | De realistiska bilarna: `BODIES` (profilkurvor per bil), `Body` (karossen), `Decals` (glas, lampor, galler, skarvar projicerade på ytan), hjulen, `CarModel` (en bil i scenen). |
| `src/scenery.js` | Världens meshar: terrängen (band längs vägen + rutnät i bitar), vägen, bron, sjön, fälten, husen, träden (instansade i bitar), räcken, stolpar, skyltar, portalerna, publiken. |
| `src/render.js` | Renderare, sol och skuggor, himmel och miljökarta, bilarna, partiklar, följekameran (`CameraRig`, GTA 7:s bilkamera). |
| `src/sky.js`, `src/textures.js` | Himlen (och reflexerna) och alla canvas-texturer. |
| `src/hud.js`, `src/audio.js`, `src/input.js` | HUD med minikarta, ljudet (motor med växlar), touch/tangentbord/handkontroll. |
| `test/sim.mjs` | Node-testerna. Stilen `check(ok, 'beskrivning')`. |

## 5. Fallgropar

- **Kurvradier under 54 m** får terrängbandet längs vägen (46 m brett) att vika sig på insidan. Testerna larmar.
- **Marken längs vägen** ritas två gånger: ett fint band (`buildTerrain` del 1) och ett grövre rutnät som sänks 2 m nära vägen (del 2). Ny mark nära vägen måste finnas i `Track.height()`, annars syns skarvar.
- Platta meshar (mark, väg, fält) vänds uppåt med `GB.faceUp()`; glöm inte det för nya.
- **Bilarnas lack** använder vertexfärger (mörk undersida/hjulhus). Delar utan färgattribut ska ha `paint2` (annars blir de svarta).
- **Slumpen:** `World` använder egna frön (`makeRng(2026)` m.fl.). Ändras ordningen flyttar sig hus och träd, och testerna kan behöva nya siffror.
- **Prestanda:** varje bil är ~33 000 trianglar, träden ~70–90 var (instansade). Grafikvalen Snygg/Auto/Snabb finns i `QUALITY` i render.js; Auto sänker upplösningen och stänger av skuggor om bildfrekvensen faller.
