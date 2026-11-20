# MobiForge 3D v0.1.4

Editor Android en horizontal, creado con Capacitor, Three.js y runtime Lua aislado.

## Mejoras de esta auditoría
- Gizmos 3D reales de traslación, rotación y escala por eje; hit targets táctiles amplios, raycast prioritario y órbita bloqueada durante la manipulación.
- Tamaño visual del gizmo compensado según distancia de cámara y alto del viewport.
- Zoom con dos dedos, canvas actualizado con `ResizeObserver`, cambios de orientación y área visible; manifest Android principal y manifest mergeado validados como `landscape` en CI.
- Render solo mientras el editor está activo; DPR limitado a 1.25, sombras de 512 px y liberación de geometrías/contexto al cambiar de escena.
- Lua ejecutado en Web Worker sin acceso a `os`, `io`, `debug` ni `package`; se cancela tras 1.5 s para evitar congelar el hilo de la interfaz.
- Preserva proyectos de inicio FPS/TPS, inspector, jerarquía, HUD y herramientas de escena.

## APK
El workflow de GitHub Actions construye un APK debug, lo publica como artifact y crea una Release pública al actualizar `main`. Un build exitoso confirma el empaquetado y la orientación del manifest mergeado; no equivale a probar gestos o rendimiento en un teléfono físico.

## Build local
Requiere Node.js 20+ y Android SDK/JDK 21.

```sh
npm install
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Limitaciones actuales
Prototipo inicial, no reemplazo completo de Godot. La demo no implementa colisiones completas, importación GLB ni API Lua para editar nodos; la escena se guarda localmente y el APK debug no es de Play Store.
