# Riksväg 7 – överlämning

Senast uppdaterad 30 oktober 2026 (version 1.0).

## 1. Vad som finns

Ett race på Riksväg 7, Ekeby → Sjuby (vägen är 5,78 km; start vid 70 m, mål ~170 m före vägens slut, alltså ~5,5 km race). Tre valbara bilar, fyra lacker per bil, fem datorförare. Startgrid i tre rader, du startar sist. Placering, tid, rekord per bil (sparas i `localStorage['riksvag7-best']`), inställningar i `localStorage['riksvag7-settings']`.

## 2. Banan (src/track.js)

- `START`, `CORNERS` (x, z, radie), `END`. Kurvorna avrundas med cirkelbågar (som GTA 7:s `RaceRoute`), vägen samplas var 2 m (`xs`, `zs`, `cum`, `ks`, `ys`, `vs`).
- Höjden: landskapets höjd längs vägen, utjämnad (gauss), platt i städerna, plan över bron (sjöytan + 4,2 m), max 7 % lutning, och två **krön** (`zones.bumps`) där bilen lyfter (upp till ~40 m hopp med Lo V8).
- Landskapet `natural(x, z)`: kullar vars storlek beror på delen av resan (`AMP` efter z), höjer sig bort från vägen (en dal), och sjön **Ekesjön** grävd i (`LAKE`). En mjuk botten hindrar andra pölar.
- `height(x, z)`: vägen på asfalten, grus 1,7 m ut, sedan ett dike och en mjuk övergång till landskapet inom ~21 m. På bron är det sjöbotten utanför däcket.
- Zoner: `ekeby`, `farm`, `forest`, `lake` (med `bridge`), `mellby`, `ridge`, `sjuby`.

## 3. Bilarna

### Fysiken (src/vehicle.js)
GTA 7:s `Vehicle.step` rad för rad i det horisontella. Tillägg: `SLOPE_G` (backar), krön via vägens krökning (±3 m), gräs (grepp ×0,62, extra motstånd), grus (grepp ×0,86). Kolliderare har en absolut `top`.

### Siffrorna (src/cars.js)
| | Svala RS | Falk GT | Lo V8 |
|---|---|---|---|
| Toppfart | 160 km/h | 169 km/h | 178 km/h |
| 0–100 | 2,7 s | 2,6 s | 2,3 s |
| Grepp | 18,6 | 16,8 | 15,2 |
Med autopilot på egen hand är tiderna ungefär 2:15 / 2:11 / 2:08.

### Modellerna (src/carmodel.js)
- `BODIES[typ]`: profilkurvor längs bilen (`top`, `belt`, `bottom`, `tumble`, `plan`), sidorutornas form (`dlo`), vindrutan (`screen`), bakrutan, strålkastar- och baklyktsformer, galler, luftintag, skyltar, avgasrör, spegel, spoiler, fälgdesign, bromsokets färg.
- `Body.ring(z)` ger tvärsnittet: golv, hjulhusets innervägg och tak (raka), sedan en Catmull-Rom-kurva över tröskel, sida, skulderlinje, sidoruta och tak. Hjulhusen uppstår av att tvärsnittets nedre del höjs över hjulen.
- Detaljer ritas i 2D och projiceras på ytan (`Decals.add` med `front`/`back`/`side`/`top`). `rounded`, `densify`, `grow` formar konturerna.
- Hjulen: däck (lathe), slitbana, fälg (extruderad med hål mellan ekrarna), fälgkant, nav, muttrar, skiva och bromsok. Bakhjulen på Lo V8 är bredare.
- `test/studio.html` + `test/browser/studio.py` är en fotostudio för att granska bilarna.

## 4. Racet (src/game.js, src/ai.js)

- Faser: `intro` (2,6 s, kameran cirklar runt dig) → `countdown` (tre röda + grönt, 3,2 s; bilen hålls) → `race` → `done` (efter din målgång; autopiloten bromsar in bilen).
- Händelser (`game.on`): `count`, `go`, `phase`, `crash`, `land`, `horn`, `reset`, `rivalFinish`, `finish`.
- Datorförarna: `RIVALS` (namn, bil, lack, `skill` i kurvor, `pace` på raksträckor). Gummiband: saktar in när de leder stort, lite snabbare när de ligger efter. Respawn om de fastnar utom synhåll.
- Spelaren sätts tillbaka på vägen (`resetPlayer`): med knappen (2,5 s spärr), längre än `LIMIT` (75 m) från vägen, eller i sjön.

## 5. Tester

- `npm test` (`test/sim.mjs`): vägen, världen (inget på vägen), bilarna (siffror, kontroller, sladd, gräs, krön), att man inte kan lämna bilen eller ta sig in i hus, hela racet med alla sex i mål, återställning, fel håll.
- `test/browser/smoke.py`, `full.py`, `views.py`, `studio.py` (se CLAUDE.md).

## 6. Idéer för nästa version

- Fler banor (en kustväg, en kvällsetapp med strålkastare), varv på en rundbana.
- Tidskörning mot ett "spöke" av ditt bästa lopp.
- Skador och smuts på lacken, regn.
- Fler bilar eller uppgraderingar (som Lasses butik i GTA 7).

## 7. Versionshistorik

- **1.0** (30 okt 2026): första racet Ekeby–Sjuby. Tre bilar (Svala RS, Falk GT, Lo V8) med realistiska modeller, fem datorförare, bilval med lackfärger, HUD med minikarta, motorljud med växlar, resultat och rekord.
