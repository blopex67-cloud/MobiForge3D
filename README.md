# MobiForge 3D v0.1.13

Editor móvil de escenas 3D.

- Quité los cubos y esferas de relleno de las escenas nuevas y de las plantillas de inicio. Se conserva el plano base y la cuadrícula del editor; el viewport ahora usa una paleta oscura/neutra con iluminación más sobria.
- Ordené y alineé las barras superiores, pestañas, botones y estados del HUD para uso horizontal.
- Los iconos de nodos 3D aparecen en rojo y los de 2D en verde cuando existan nodos 2D; no se añadieron tipos nuevos de nodo.
- El modo Script tiene resaltado básico de Lua/GLSL y muestra el mensaje de error devuelto por Lua, incluyendo línea cuando el runtime la informa.
- Añadí al bridge Lua compatibilidad para el patrón de outline del script: `node:get_child("OutlineMesh")`, proxy `set_scale`, propiedades `node.material.outline_*` y emisión. El outline se dibuja como una capa geométrica exterior; no es un shader de contorno de Unreal.
- La función `update(dt)` se ejecuta continuamente mientras el juego corre. Para ver el pulso, aplica el script y ejecuta el juego.
- Lua ejecuta APIs proporcionadas por MobiForge, no APIs arbitrarias de Godot/Unreal. Los errores de funciones y sintaxis no compatibles se reportan en el editor.

## Sobre el script enviado
El texto usa Lua válido en cuanto a funciones, tablas, `pcall`, `math.sin` y `update(dt)`, salvo que el `*` inicial de `*--` se haya copiado literalmente: Lua marcaría `*` como error de sintaxis; elimina ese carácter si está en el editor. Antes el script no podía producir su outline porque Fengari solo exponía `node.name` y las cuatro funciones globales de movimiento: no existían `node:get_child`, `node.material.outline_enabled`, ni el proxy `OutlineMesh:set_scale`. Esta versión implementa ese subconjunto de compatibilidad. Los shaders/materiales especiales o meshes de outline arbitrarios de Unreal siguen fuera de esa API.

## Guardado
Las escenas y los scripts persisten en rutas virtuales `scenes/` y `scripts/` por proyecto en `localStorage`. La compilación y el APK se verifican en CI; eso no reemplaza la prueba visual/táctil en Android.
