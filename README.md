# MobiForge 3D v0.1.11

Editor táctil de juegos 3D Android horizontal.

## Sistema de escenas
- Las pestañas de escena aparecen en la franja sobre el visor 3D. Toca una para cambiar de escena, usa **×** para cerrar la pestaña sin borrar su archivo y **＋** para crear una escena nueva.
- Cada escena conserva su propio árbol, transformaciones y scripts. Se guarda automáticamente al cambiar o cerrar pestañas y con el botón Guardar.
- El icono de cadena del panel de jerarquía permite instanciar una escena guardada como hija del nodo seleccionado. La instancia reutiliza los tipos de nodo contenidos en esa escena; la jerarquía muestra ⛓ en sus nodos raíz.
- La pestaña **Escenas** permite abrir, instanciar y borrar archivos de escena. La pestaña **Archivos** muestra y permite borrar los JSON locales de `scenes/` y `scripts/`.
- Las carpetas son rutas virtuales representadas por claves jerárquicas en `localStorage`, separadas por proyecto. No se crean carpetas físicas en Android.
- No se añadieron tipos de nodo al proyecto para el sistema de escenas. La instancia clona los nodos guardados existentes.

## Scripts y modelos
El contenido de cada script se guarda separado por objeto en `scripts/<proyecto>/<escena>/<objeto>.json`; la escena guarda los enlaces a esos scripts en `scenes/<proyecto>/<escena>.json`. Los modelos GLB/GLTF no se incrustan en estos JSON y deben reimportarse si la escena los requiere.

## Validación
La sintaxis JS y la estructura de los handlers/IDs se revisan antes del build. Compilación, firma y orientación Android se verifican en CI; eso no sustituye una prueba táctil/visual en el dispositivo.
