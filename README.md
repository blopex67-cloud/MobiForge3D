# MobiForge 3D v0.1.9

Editor táctil de juegos 3D en horizontal, con viewport, árbol de nodos, inspector y controles de transformación.

## Esta versión
- Eliminé el botón de script hijo y el control de acción sin función. Ya no se crean nodos Script ni aparecen en el árbol.
- El script Lua pertenece al objeto: se edita desde su Inspector y, al entrar en el modo Script, aparece un editor centrado sobre el visor. Ambos editores sincronizan el mismo texto.
- Separé el punto de enfoque de la cámara del transform del objeto. Mover/rotar/escalar con gizmos no arrastra el encuadre; los gestos de órbita y paneo mueven ese punto de forma independiente.
- Al importar GLB/GLTF centro el escenario, ajusto su escala cuando es desmesurada y encuadro la cámara según sus límites. Rechazo archivos con dimensiones fuera de rango y limpio gestos antiguos al cambiar/importar escena.
- Añadí outline de forma seleccionable, activado inicialmente.
- La pestaña Escenas permite abrir FPS/TPS y escenas de prueba, insertar escenas de prueba en el proyecto, y abrir o borrar escenas guardadas. Guardar escena crea un registro recuperable en este dispositivo. Los GLB/GLTF no se incrustan en el guardado: se indican para reimportarlos al abrirlo.
- Quité la pestaña Nodo inactiva, el icono de Vista sin acción, el botón de acción vacío y el panel de importación duplicado.

## Actualizaciones
El actualizador busca Releases, descarga el APK firmado y abre el instalador Android; el sistema pide confirmar la instalación. La clave de firma se mantiene para actualizaciones compatibles.

## Validación
`node --check` y el bundle del código de navegador con esbuild pasan. El build local de Vite no pudo reservar memoria WebAssembly en este entorno; el build de Android en CI y la firma aún deben confirmarse para esta versión. No es una prueba táctil ni visual en un Android físico.
