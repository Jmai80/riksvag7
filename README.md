# Riksväg 7

Ett racingspel som körs direkt i webbläsaren och är byggt för mobilen först. Version 1.3 har **två banor** på samma 5,5 km landsväg mot fem datorförare: **Bana 1, Dagsetappen** från staden **Ekeby** till målet i **Sjuby** i solsken, och **Bana 2, Kvällsracet**, tillbaka från Sjuby till Ekeby i skymningen med strålkastarna på. Dessutom en **topplista på nätet** per bana, detaljerade träd längs vägen och en lugn stund med musik efter målgången.

**Spela:** https://jmai80.github.io/riksvag7/

Spelet är syskon till [GTA 7](https://github.com/Jmai80/gta7) och delar dess grund: three.js 0.184 från jsDelivr, vanliga ES-moduler utan byggsteg, allt procedurellt (inga bild-, modell- eller ljudfiler) och samma bilfysik och kontroller. Skillnaden är att du aldrig kliver ur bilen – det finns ingen knapp för det – och att bilarna är byggda för att se riktiga ut i stället för tecknade.

## Racet

- **Välj bana** överst i bilvalet:
  - **Bana 1 · Dagsetappen** – Ekeby → Sjuby i eftermiddagssol.
  - **Bana 2 · Kvällsracet** – Sjuby → Ekeby i skymningen: lila himmel, stjärnor, tända gatlyktor och fönster, strålkastare som lyser upp vägen och röda baklyktor framför dig. Start under målportalen i Sjuby, mål under en egen portal inne i Ekeby. Krönen, kurvorna och bromspunkterna kommer från andra hållet, och avståndsskyltarna räknar ner till Ekeby.
- **Välj bil** bland tre, och välj lack (fyra färger per bil):
  - **Svala RS** – en lätt hot hatch. Bäst väghållning, lägst toppfart (160 km/h).
  - **Falk GT** – en sportcoupé. Stark och stabil (169 km/h).
  - **Lo V8** – en låg superbil med vinge. Snabbast (178 km/h) men nervös i kurvorna.
- **Sex bilar på startlinjen**, du startar sist. Tre röda lampor på startportalen, sedan grönt.
- **Vägen:** ut ur Ekeby mellan flerfamiljshus och butiker, förbi en mack, över åkrarna med röda gårdar, ladugårdar och rapsfält, ett krön där bilen lyfter, skogens S-kurvor, bron över **Ekesjön** med båthus och bryggor, byn **Mellby** med kyrkan och den skarpa höger-vänster-kurvan, åsen med ett andra krön, och till sist in i Sjuby till målportalen.
- Hus, träd, stenar, räcken och stolpar går inte att köra igenom. Kör du för långt ut på fälten (75 m från vägen) eller ner i sjön sätts du tillbaka på vägen. **TILLBAKA**-knappen (R) gör samma sak när du kört fast.
- Efter målgången: motorerna tystnar, en glad melodi spelar och sedan en lugn låt medan du tittar på placering, tid, rekord per bana och bil och hela resultatlistan.
- **Träden längs vägen** är detaljerade: granar med hängande grenar i varv, tallar med orange stam och barrtofsar, björkar med vit näver och hängande lövkvistar. De gungar lite i vinden och kastar skuggor på vägen. Längre bort används enklare träd.
- **Topplistan:** efter målgången skriver du ditt namn och trycker **SPARA TID**. Spelet berättar var du hamnade på banan, totalt och med din bil. **TOPPLISTA** på startsidan visar de tio bästa tiderna per bana (flikar för Bana 1 och Bana 2), för alla bilar eller en i taget. Listan ligger i en tabell (`riksvag7_highscores`, kolumnen `track` säger vilken bana) i Supabase-projektet cityguess; tabellen skapas med `supabase/riksvag7_highscores.sql`.

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
- `src/course.js` – banorna: samma väg körd åt ena eller andra hållet (racet, datorförarna och HUD:en pratar bara med en bana).
- `src/world.js` – allt längs vägen som data: hus, gårdar, kyrkan, träd, fält, räcken, skyltar och kollisioner.
- `src/carmodel.js` – de realistiska bilarna: en mjuk kaross svept längs bilen, detaljer projicerade på ytan, hjul med fälgar och bromsok.
- `src/game.js`, `src/ai.js` – racet och datorförarna (från GTA 7:s gatloppsförare).
- `src/render.js`, `src/scenery.js`, `src/trees.js`, `src/sky.js`, `src/textures.js` – grafiken (dag och skymning: `LIGHT` i render.js, `MOODS` i sky.js); `src/hud.js`, `src/audio.js`, `src/input.js`, `src/main.js` – resten.
- `src/leaderboard.js` – topplistan: vanliga anrop mot Supabase REST med projektets publika nyckel, precis som cityguess gör.

## Köra lokalt

```sh
npm install --no-save three@0.184.0   # bara för webbläsartesterna
npm test                              # Node-testerna: "All checks passed"
python3 -m http.server 8000           # öppna http://localhost:8000
```
