# MobiForge 3D v0.1.7

Editor 3D móvil horizontal con visor central, árbol padre/hijo, inspector y controles de transformación.

## Cambios de esta versión
- Al ejecutar se guarda una copia de transforms; detener restaura posición, rotación y escala del árbol.
- El controlador del jugador aplica movimiento relativo a la cámara, aceleración/fricción, gravedad, suelo, salto y cámara FPS/TPS.
- Cada objeto puede tener nodos de script Lua hijos. El árbol muestra el nombre y el padre; el inspector edita transforms del objeto al seleccionar su script.
- El editor de script permite `start`, `update(dt)`, `move(x,y,z)`, `set_position(x,y,z)`, `rotate(x,y,z)` y `set_scale(x,y,z)`.
- Importación desde Android de GLB/GLTF; para GLTF externo selecciona junto al modelo sus archivos `.bin` y texturas en el mismo diálogo. Los recursos cargados se guardan durante la sesión y se liberan al cambiar escena.
- Retiré pestañas de ejemplo vacías y la barra inferior Script/HUD; el HUD de juego usa controles dentro de los límites y áreas seguras.
- Actualizador integrado: comprueba el último release, descarga el APK y abre el instalador de Android. Android conserva su confirmación obligatoria.

## Actualización
La v0.1.7 conserva la clave de firma estable configurada para la v0.1.6, por lo que Android permite instalar la actualización desde la app. Tras aceptar el permiso de instalar desde MobiForge (si lo solicita), se comprueba al abrir y también desde el icono de actualización.

## Build y validación
CI construye APK de release, lo firma, verifica firma y confirma orientación horizontal en manifiesto fusionado. Esto no sustituye la prueba en teléfono. Física y colisiones todavía son básicas; no equivalen al motor de física de Godot. Para importar GLTF con recursos externos, selecciona todos sus archivos relacionados en el selector múltiple.
