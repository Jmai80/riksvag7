# Riksväg 7

Ett racingspel som körs direkt i webbläsaren och är byggt för mobilen först. Version 1.0 är det första racet: 5,5 km landsväg från staden **Ekeby** till målet i **Sjuby**, mot fem datorförare.

**Spela:** https://jmai80.github.io/riksvag7/

Spelet är syskon till [GTA 7](https://github.com/Jmai80/gta7) och delar dess grund: three.js 0.184 från jsDelivr, vanliga ES-moduler utan byggsteg, allt procedurellt (inga bild-, modell- eller ljudfiler) och samma bilfysik och kontroller. Skillnaden är att du aldrig kliver ur bilen – det finns ingen knapp för det – och att bilarna är byggda för att se riktiga ut i stället för tecknade.

## Racet

- **Välj bil** bland tre, och välj lack (fyra färger per bil):
  - **Svala RS** – en lätt hot hatch. Bäst väghållning, lägst toppfart (160 km/h).
  - **Falk GT** – en sportcoupé. Stark och stabil (169 km/h).
  - **Lo V8** – en låg superbil med vinge. Snabbast (178 km/h) men nervös i kurvorna.
- **Sex bilar på startlinjen**, du startar sist. Tre röda lampor på startportalen, sedan grönt.
- **Vägen:** ut ur Ekeby mellan flerfamiljshus och butiker, förbi en mack, över åkrarna med röda gårdar, ladugårdar och rapsfält, ett krön där bilen lyfter, skogens S-kurvor, bron över **Ekesjön** med båthus och bryggor, byn **Mellby** med kyrkan och den skarpa höger-vänster-kurvan, åsen med ett andra krön, och till sist in i Sjuby till målportalen.
- Hus, träd, stenar, räcken och stolpar går inte att köra igenom. Kör du för långt ut på fälten (75 m från vägen) eller ner i sjön sätts du tillbaka på vägen. **TILLBAKA**-knappen (R) gör samma sak när du kört fast.
- Efter målgången: placering, tid, rekord per bil och hela resultatlistan.

## Kontroller

| | Mobil | Dator | Handkontroll |
|---|---|---|---|
| Gas / broms / back | Spaken: tummen uppåt / nedåt (eller GAS och BROMS med "Pedaler") | W / S eller pilarna | RT / LT |
| Styra | Spaken åt sidorna | A / D eller pilarna | Vänster spak |
| Handbroms | HANDBROMS | Space | X / RB |
| Tillbaka på vägen | TILLBAKA | R | Y |
| Kamera (bakom / nära) | Pausmenyn | C | – |
| Titta runt | Dra på högra halvan | – | Höger spak |
| Paus | ⏸ | Esc / P | Start |

## Teknik i korthet

- `src/vehicle.js` – GTA 7:s bilfysik, plus backar, krön (bilen flyger när vägen faller undan) och gräs/grus som greppar sämre.
- `src/track.js` – vägen (raksträckor och cirkelbågar var 2:a meter), höjdprofilen och landskapet runt den.
- `src/world.js` – allt längs vägen som data: hus, gårdar, kyrkan, träd, fält, räcken, skyltar och kollisioner.
- `src/carmodel.js` – de realistiska bilarna: en mjuk kaross svept längs bilen, detaljer projicerade på ytan, hjul med fälgar och bromsok.
- `src/game.js`, `src/ai.js` – racet och datorförarna (från GTA 7:s gatloppsförare).
- `src/render.js`, `src/scenery.js`, `src/sky.js`, `src/textures.js` – grafiken; `src/hud.js`, `src/audio.js`, `src/input.js`, `src/main.js` – resten.

## Köra lokalt

```sh
npm install --no-save three@0.184.0   # bara för webbläsartesterna
npm test                              # Node-testerna: "All checks passed"
python3 -m http.server 8000           # öppna http://localhost:8000
```
