# MobiForge 3D v0.1.10

Editor táctil de juegos 3D Android horizontal.

## Código del objeto
- El código se edita solamente en el modo **Script**, en el panel centrado sobre el visor. El Inspector no contiene editor de código.
- **Lua:** runtime embebido con la API de objetos de MobiForge (`move`, `set_position`, `rotate`, `set_scale`). No ejecuta JavaScript, Python ni código nativo; usa un entorno controlado.
- **GLSL:** el modo shader admite fragmentos para el material estándar y shaders completos de fragmento, además de una etapa Vertex personalizable. El shader debe ser GLSL compatible con WebGL/Three.js, no cualquier lenguaje o formato de shader.
- **Imágenes:** selecciona una imagen para aplicarla como textura al objeto. Imágenes pequeñas (hasta 1 MB) se guardan dentro de las escenas guardadas; otras imágenes deben volver a importarse.
- La edición de Lua y shaders permanece asociada al objeto seleccionado. La interfaz evita selección accidental de texto; los dos campos de código sí permiten seleccionar/copiar.

## Escenas y nodos
- La pestaña Escenas lista solo escenas guardadas en el proyecto actual. Puedes crear una escena, abrirla, insertarla o borrarla.
- Añadir nodo muestra un selector filtrable con nodos 3D comunes de estilo Godot: malla, cuerpos, colisión, cámaras y luces.
- Cuerpos y colisionadores son marcadores de jerarquía/forma; todavía no constituyen un motor de colisiones o dinámica.
- La selección del viewport se procesa al tocar el objeto, además del árbol.

## Guardados y formatos
Las escenas se guardan localmente por proyecto. GLB/GLTF grandes no se incrustan; el guardado conserva sus nombres y pide reimportarlos al abrir. GLSL se ejecuta en la GPU mediante el shader/material de Three.js.

## Validación
La sintaxis JS y las referencias estáticas se revisaron. El build de Android, firma y orientación horizontal se deben verificar en CI para v0.1.10; esto no equivale a prueba visual/táctil en dispositivo.
