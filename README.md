# Constelación de Founders — SLA

Un mapa del cielo nocturno del ecosistema tech de LATAM, contado por SLA. Cada invitado es una estrella. Las líneas unen a las personas que comparten empresa (línea continua), episodio (línea punteada) o inversores. Cada vertical tiene su propio color y su propia región del cielo.

## Técnica
- HTML, CSS y JS estático con Canvas 2D. No usa dependencias ni CDN, y no hay build. Se eligió Canvas 2D porque con este tamaño de datos alcanza, carga al instante y anda bien en el celular. Si el cielo crece a cientos de estrellas, se puede pasar a three.js.
- Las posiciones son deterministas: se calculan con un hash del `id` y se agrupan por vertical, así que el cielo queda igual entre recargas.
- El tamaño de cada estrella depende de la cantidad de apariciones, más log10(views) cuando hay datos de views.
- El sonido ambiente se genera con WebAudio (osciladores sinusoidales con LFO) y no usa archivos. Al tocar una estrella suena un "blip".
- La cámara deriva despacio, las estrellas titilan y el polvo de estrellas tiene parallax.

## Cómo verlo
`python3 -m http.server` dentro de esta carpeta, y abrir http://localhost:8000. Hace falta servirlo porque `fetch` no anda con `file://`.

## Cómo agregar un invitado
Editá `data/constellation.json`:
1. Si la empresa no existe todavía, agregala en `companies` con `id`, `name`, `vertical` (un id de `verticals`, o `null`) y `url`.
2. Si el episodio es nuevo, agregalo en `episodes` con `id`, `number`, `date`, `title`, `youtube` y `views` (`null` si no se sabe).
3. Agregá la persona en `people` con `id`, `name`, `role`, `companies: [ids]`, `episodes: [ids]`, `x` e `investors: [ids]`.
Las líneas se arman solas. Lo que no se sabe va en `null`. No se inventa nada.
