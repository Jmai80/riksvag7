# CLAUDE.md – Riksväg 7 (github.com/Jmai80/riksvag7)

Startpunkten för en ny Claude Code-session. Läs hela filen och sedan `docs/HANDOFF.md`.

Senast uppdaterad 31 oktober 2026, version **1.4**: startsidans kamera flyger längs hela vägen och **sveper från sida till sida** över landskapet. Version 1.3 gav **två banor** – Bana 1 Ekeby → Sjuby på dagen och Bana 2 "Kvällsracet" Sjuby → Ekeby i skymningen med strålkastare – och topplistan per bana; 1.2 gav detaljerade träd och en lugn målgång, 1.1 topplistan på nätet (Supabase), 1.0 första racet med tre valbara bilar och fem datorförare.

## 1. Projektet på en minut

- **Riksväg 7** är ett racingspel i webbläsaren, mobilen först. Syskon till **GTA 7** (github.com/Jmai80/gta7) och byggt på samma sätt: **three.js 0.184 från jsDelivr** via `src/three.js`, vanliga ES-moduler, **inget byggsteg**, allt procedurellt (inga bild-, modell- eller ljudfiler; typsnittet ligger i `fonts/`).
- **Bilarna rör sig och styrs som i GTA 7.** `src/vehicle.js` är GTA 7:s fysik (acceleration, broms, grepp, sladd, handbroms, hastighetskänslig styrning, kollisioner) och `Game.drive()` i `src/game.js` är GTA 7:s mappning från spak/pedaler/tangentbord/handkontroll. Ändra inte känslan utan att användaren ber om det.
- **Man kan inte lämna bilen** och **inte gå in i byggnader**: det finns ingen kliv-ur-knapp eller kod för det, och alla hus är solida kollisioner. Testerna kontrollerar båda.
- Simuleringen (bana, fysik, AI, race) är ren JavaScript utan three.js och testas i Node. Grafiken är separat.
- Spelet ligger på **https://jmai80.github.io/riksvag7/** (GitHub Pages från `main`, repots rot).
- **Banorna** är samma väg åt olika håll: `src/course.js` (`COURSES`, `Course`) lägger riktningen ovanpå `Track`. Racet, datorförarna och HUD:en får en `Course` (som `game.track`); världen och terrängen byggs en gång. Varje bana har en stämning (`mood`: `day`/`dusk`) som `View.setMood()` sätter.
- **Topplistan** är tabellen `riksvag7_highscores` i användarens Supabase-projekt **cityguess** (samma projekt som cityguess egen `highscores`; användaren har även ett projekt "wordle" för andra spel). `src/leaderboard.js` anropar Supabase REST med `fetch` och den publika nyckeln, som cityguess `app.js`. Tabellen och dess regler (RLS: alla får läsa och lägga till, ingen får ändra eller ta bort) finns i `supabase/riksvag7_highscores.sql`. Kolumnen `track` (banans id, standard 1) finns sedan 1.3; en ny bana ska få ett nytt id. Sandlådan når inte Supabase – testa mot låtsasservern i `test/browser/board.py` och be användaren provspela. Kopian i Claude får inte anropa andra värdar, så där säger spelet att topplistan nås från github.io.
- **Databasändringar:** SQL körs i Supabase **SQL Editor** (säg det uttryckligen). Användaren föredrar annars Table Editor.

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
python3 test/browser/smoke.py phone          # titel → bilval → race på autopilot, skärmdumpar (sista argumentet = bana, t.ex. "phone svala 2")
python3 test/browser/full.py phone falk 2    # hela racet till resultatlistan, här på bana 2
python3 test/browser/views.py v 300 2600     # stora bilder från platser längs vägen (meter från start)
python3 test/browser/studio.py car "car=lo&paint=orange&yaw=0.8"   # fotostudio för bilmodellerna (test/studio.html)
python3 test/browser/board.py phone          # topplistan mot en låtsas-Supabase
python3 test/browser/sound.py                # ljudet kring målgången, mätt med en analysator: "SOUND ok"
PHONE=1 python3 test/browser/views.py t 1745 # telefonbilder från platser längs vägen
python3 test/browser/sheet.py lo 2           # skärmdumpsarkets bilder längs ett helt race (här bana 2)
python3 test/browser/title.py phone 8 2.5 105   # startsidans flygning: 8 bilder med 2,5 s mellanrum, från sekund 105 (sjön)
python3 test/browser/compose.py ut.png 3 "test/shots/a.png|Bildtext" …   # arket: rutnät med gula bildtexter
```

- Webbläsartesterna kör Chromium med SwiftShader. `test/browser/cdn.py` serverar three.js från `node_modules` (sandlådan når inte jsDelivr).
- Sidan öppnas med **`?manual`**: då står spelklockan still och testerna driver den med `window.__rv.run(sekunder)` (simulerar utan att rita, ritar sista bilden). Utan det går mjukvaru-WebGL för långsamt.
- `window.__rv`: `game`, `view`, `track`, `world`, `course`, `courses`, `best`, `state`, `toSelect()`, `setCar(typ)`, `setCourse(id)`, `startRace()`, `pause(on)`, `run(sek, steg)`, `until(villkor, maxSek)` (stega tills villkoret gäller, rita sedan en bild). `test/browser/sheet.py` tar skärmdumpsarkets bilder.
- Låt autopiloten köra spelarens bil: `g.player.auto = new Driver(g, g.player, { skill: 1, base: 2, dist: g.player.dist, player: true })` (se `test/browser/full.py`).

## 4. Karta över koden

| Fil | Vad |
|---|---|
| `index.html` | All CSS och alla overlays: laddning, titel (vägskylten), bilval med banval (`#courses`), HUD, touchknappar, paus, resultat, topplistan (`#bTracks`, `#bChips`). |
| `src/main.js` | Skärmarna och loopen (fast 60 Hz-simulering), kameran per skärm, inställningar och rekord i `localStorage`, `window.__rv`. |
| `src/titlecam.js` | Startsidans kamera (`TitleCam`, inställningarna i `SWEEP`): flyger längs vägen mellan stadskärnorna och svingar ±60 m från sida till sida (ett helt antal sving per varv), blicken vänd över vägen; höjden räknas ut i förväg för hela varvet (över trädtoppar och tak, högst 6 m/s upp eller ner, mjukt utjämnad). `#veil` tonar till svart där varvet börjar om. |
| `src/track.js` | Vägen (`CORNERS`: punkter med kurvradie, samplad var 2 m), zonerna (`ekeby`, `farm`, `forest`, `lake`/`bridge`, `mellby`, `ridge`, `sjuby`, `start`, `finish`, `finish2` (bana 2:s mål), `bumps`), höjdprofilen, landskapet (`natural`, `height`), `groundHeight`/`surfaceAt` för fysiken, `nearest`/`project`, `speedProfile(baklänges)`. |
| `src/course.js` | Banorna: `COURSES` (namn, stämning, riktning), `Course` (vägen åt ett håll: `zones`, `pointAt`, `beside`, `project`, egen hastighetsprofil). |
| `src/world.js` | Allt längs vägen som data + kollisionsgriden: `buildings`, `trees`, `fields`, `rails`, `lamps`, `poles`, `posts`, `signs`, `gantries`, `crowd`, `rocks`, `bales`, `flags`, `docks`. |
| `src/vehicle.js`, `src/collide.js` | Bilfysiken (GTA 7) och kollisionsgriden. |
| `src/cars.js` | De tre bilarnas siffror (`CAR_TYPES`), lackerna (`PAINTS`), växellådan (`GEARS`, `gearOf`), `zeroTo100`, `topSpeed`. |
| `src/game.js` | Racet: startgrid, intro → nedräkning → race → mål, placeringar, `standings()`, fel håll, för långt ut, `resetPlayer()`. |
| `src/ai.js` | Datorförarna (`RIVALS`, `Driver`): racinglinje, omkörningar, gummiband, respawn. |
| `src/carmodel.js` | De realistiska bilarna: `BODIES` (profilkurvor per bil), `Body` (karossen), `Decals` (glas, lampor, galler, skarvar projicerade på ytan), hjulen, `CarModel` (en bil i scenen). |
| `src/scenery.js` | Världens meshar: terrängen (band längs vägen + rutnät i bitar), vägen, bron, sjön, fälten, husen, träden (instansade i bitar), räcken, stolpar, skyltar, portalerna, publiken. Träd närmare vägen än `NEAR_TREE` (45 m) får de detaljerade modellerna i grupper om 120 m väg; inom `DETAIL_RANGE` (120 m) från kameran visas de detaljerade, annars de enkla (`update()` byter). |
| `src/trees.js` | De detaljerade träden: gran, tall, björk (två varianter var). Stam och grenar som rör med barktextur, barr och löv målade på canvas och upphängda på kort (alpha-cut, belysta från båda sidor, gungar i vinden via `onBeforeCompile`). `test/treestudio.html` visar dem. |
| `src/render.js` | Renderare, sol och skuggor, himmel och miljökarta, bilarna, partiklar, följekameran (`CameraRig`, GTA 7:s bilkamera). |
| `src/sky.js`, `src/textures.js` | Himlen (`MOODS`: dag och skymning, miljökarta per stämning) och alla canvas-texturer (bland annat tända fönster och ljuskäglor). |
| `src/hud.js`, `src/audio.js`, `src/input.js` | HUD med minikarta, ljudet (motor med växlar; `finish()` tystar motorerna och spelar målmelodin, `lounge(on)` den lugna låten på resultatskärmen, `reset()` vid nytt race), touch/tangentbord/handkontroll (tangenterna släpps igenom när man skriver i ett textfält). |
| `src/leaderboard.js`, `supabase/` | Topplistan: `fetchTop(bana, bil)`, `submit({ …, track })`, `rankOf(tid, bana, bil)`, `cleanName`; SQL för tabellen. |
| `test/sim.mjs` | Node-testerna. Stilen `check(ok, 'beskrivning')`. |

## 5. Fallgropar

- **Kurvradier under 54 m** får terrängbandet längs vägen (46 m brett) att vika sig på insidan. Testerna larmar.
- **Marken längs vägen** ritas två gånger: ett fint band (`buildTerrain` del 1) och ett grövre rutnät som sänks 2 m nära vägen (del 2). Ny mark nära vägen måste finnas i `Track.height()`, annars syns skarvar.
- Platta meshar (mark, väg, fält) vänds uppåt med `GB.faceUp()`; glöm inte det för nya.
- **Bilarnas lack** använder vertexfärger (mörk undersida/hjulhus). Delar utan färgattribut ska ha `paint2` (annars blir de svarta).
- **Slumpen:** `World` använder egna frön (`makeRng(2026)` m.fl.). Ändras ordningen flyttar sig hus och träd, och testerna kan behöva nya siffror.
- **Prestanda:** varje bil är ~33 000 trianglar; de enkla träden ~70–90 var, de detaljerade 480–660. En bild med skuggor är ~550 000–820 000 trianglar och ~220–360 anrop (mätt med `renderer.info`). Bara de detaljerade träden kastar skuggor; skuggrutan är ±58 m och ligger lite framför bilen. Grafikvalen Snygg/Auto/Snabb finns i `QUALITY` i render.js; Snabb stänger av de detaljerade träden, Auto sänker upplösningen och stänger av skuggor om bildfrekvensen faller.
- **Skymningen** är ljusare än natt med flit (exponering 1,2, ingen skuggkarta). Strålkastarna är en `SpotLight` på din bil plus additiva ljusplan; fler riktiga ljus blir dyrt på mobilen. Ändras antalet synliga ljus kompileras shaders om – `boot()` kompilerar båda stämningarna i förväg.
- **Världens slumpföljd:** saker som ska finnas bara för en bana (som bana 2:s målportal) läggs sist i `World` med eget frö, annars flyttar sig träd och hus i bana 1.
- **Startsidans flygning** räknar ut höjden för ett helt varv när spelet laddas (ca 2 800 punkter). Ändras vägen, husen eller träden följer höjden med automatiskt; Node-testerna kontrollerar att kameran aldrig går in i ett träd eller hus och att den stiger och sjunker mjukt.
- **Ljudet efter målgången:** allt kontinuerligt (motorer, vind, däck, grus) tonas ut när `audio.calm` är satt. Glöm inte `audio.reset()` när ett nytt race startar.
