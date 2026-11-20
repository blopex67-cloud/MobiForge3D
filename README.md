# MobiForge 3D v0.1.5

Editor Android táctil en horizontal con una interfaz de trabajo sobria inspirada en editores 3D: árbol de escena y archivos a la izquierda, viewport 3D con barra de herramientas al centro, inspector a la derecha y panel inferior. La captura del usuario se toma como referencia de distribución y densidad; no usa tema neón, tarjetas flotantes ni gradientes decorativos de interfaz.

## Incluye
- Escenas de inicio FPS y TPS; creación de proyectos y nodos básicos.
- Gizmos 3D de mover, rotar y escalar en ejes X/Y/Z, con prioridad de raycast y órbita bloqueada mientras arrastras.
- Tamaño aparente de gizmos ajustado por distancia, viewport redimensionable y zoom de dos dedos.
- Runtime Lua en Web Worker, sin bibliotecas `os`, `io`, `debug` ni `package`, con límite de ejecución de 1,5 segundos.
- Ajustes de rendimiento móvil: DPR limitado, sombras contenidas, render detenido fuera del editor y liberación de recursos al cambiar de escena.
- Build CI fija la Activity principal en landscape y valida que el manifiesto Android combinado mantenga landscape antes de publicar el APK.

## Build local
Requiere Node.js 20+ y Android SDK/JDK 21.

```sh
npm install
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Verificación y alcance
Una compilación y la validación del manifest no prueban la apariencia, la orientación efectiva ni la respuesta táctil en un teléfono; esa verificación física queda pendiente. Es un prototipo, no un reemplazo completo de Godot: todavía no incluye colisiones completas, importación GLB ni API Lua para manipular nodos. APK debug, no firmado para Play Store.
