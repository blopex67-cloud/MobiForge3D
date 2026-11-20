# MobiForge 3D v0.1.6

Prototipo Android horizontal de editor 3D móvil. Interfaz compacta con visor central amplio, árbol de escena, inspector, Lua y herramientas de transformación.

## Mejoras recientes
- HUD más bajo, paneles laterales estrechos y panel Lua/HUD que no tapa la mayor parte del visor.
- Se quitó el botón inferior redundante de gizmos: mover, rotar y escalar se seleccionan con iconos en la barra del visor.
- Iconos SVG Lucide incluidos localmente.
- El botón de actualización y la comprobación al abrir consultan el último Release público. Si existe una versión nueva, la app descarga el APK y abre el instalador Android; Android exige que la persona confirme. La primera vez puede pedir permiso para instalar apps de esta fuente.
- APK firmado con clave estable y `versionCode` creciente para permitir actualizaciones sucesivas dentro de Android.
- Orientación horizontal validada en el manifiesto combinado.

## Importante para instalar
La v0.1.5 se firmó con una clave temporal de CI; Android no acepta instalar sobre ella una APK con la nueva clave estable. Para pasar a v0.1.6 hay que reemplazar la instalación anterior una vez; después, la app avisa y prepara futuras actualizaciones sin buscar ni descargar el APK manualmente. Android siempre muestra su confirmación de instalación: una app normal no puede actualizarse en silencio.

## Alcance
Build, firma y orientación pueden verificarse en CI; aún hace falta probar el encuadre y los controles en un teléfono real. Prototipo: no reemplaza Godot ni incluye todavía importación GLB o colisiones completas. La distribución actual es APK, no Play Store.
