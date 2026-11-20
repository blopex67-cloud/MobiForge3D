# MobiForge 3D

Prototipo de motor/editor de juegos pensado para crear desde un teléfono Android. App Capacitor con escena 3D Three.js y runtime Lua Fengari.

## Incluye en v0.1
- Pantalla de proyectos con plantillas **First Person Starter (FPS)** y **Third Person Starter (TPS)**, y creación de proyectos propios.
- Viewport 3D táctil: selección por toque, órbita, zoom y selección de nodos.
- Árbol de escena con nodos básicos; inspector para posición, rotación y escala.
- Gizmos mediante modos mover/rotar/escalar y controles de ejes.
- Editor y ejecución de Lua embebido, con salida de `print()`.
- Modo Jugar con joystick virtual, giro táctil de cámara, cámara en primera/tercera persona y botones de salto/acción.
- Vista previa de HUD con elementos arrastrables y guardado local del estado de escena.

## Desarrollo
Requiere Node.js 20+ y Android SDK/JDK 21 para Android.

```sh
npm install
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

En GitHub Actions se compila el APK debug al hacer push a `main` o al ejecutar manualmente `Build Android APK`. Se publica como artifact y como release pública.

## Alcance y límites conocidos
Esto es una **primera base funcional**, no un reemplazo completo de Godot. El editor Lua tiene runtime embebido, pero todavía no ofrece API Lua para controlar nodos; el movimiento FPS/TPS es una demo con geometría básica, no un juego completo con colisiones o importación de assets. Los cambios de escena se guardan localmente en el dispositivo. El APK de Actions es debug y no está firmado para Play Store.
