# Ejecución del plan OmniPizza SA / mobilewright / a11y / security

Fecha de ejecución: 2026-07-14

## Resultado ejecutivo

- El spike de `mobilewright` no pasó el gate de 3 intentos limpios en Android ni iOS. El fallback elegido para ambas plataformas es Appium.
- El saneo de checkout/order-success, el mercado SA (`ar-SA`, SAR y `district`), la selección `BROWSERS`, axe y los plugins/acciones de seguridad quedaron implementados.
- La suite API real pasó completa contra Render: **46 scenarios / 242 steps**.
- El fallback Appium creó una sesión real en el Z Flip 6 y alcanzó el catálogo, pero el APK mostró `Unable to load the menu. Please try again.` y no renderizó cards; la suite móvil completa no se puede declarar verde.
- La validación web real está bloqueada en este host: Playwright 1.61.1 crea el proceso de Chromium, pero el handshake de `browserType.launch` expira a los 180 s. Por esa razón no se declaran verdes los baselines, axe ni las matrices cross-browser.
- Las ejecuciones reales de ZAP/MobSF/Schemathesis/testssl quedan condicionadas por infraestructura local ausente; las integraciones compilan y están registradas, pero no se reporta un scan ficticio.

## Fase 0 — spike mobilewright

Binarios inspeccionados e instalados:

- Android: `assets/apps/android/omnipizza-release.apk`, OmniPizza **1.1.3**.
- iOS: `assets/apps/ios/OmniPizza.app`, OmniPizza **1.1.3**.
- Fuente OmniPizza inspeccionada: `5a1ccf57...`, `app.json` 1.1.3.

El plan esperaba 1.1.2/cf8d2c9; los artefactos locales son una versión posterior, no una versión vieja. Android se ejecutó sobre el Z Flip 6 físico `R5CX71NFF9H`; iOS sobre el simulador iPhone 17 Pro `A21A24AB-4BBC-4C36-9FF7-C583AE7DA2AC` (runtime disponible 26.4, no el 26.2 del passport).

### Android — 3 intentos frescos

Cada intento limpió el estado (`force-stop`/`pm clear`) y usó `DEVICE_PROFILE=z_flip_6`, porque `CAP_PROFILE` queda sobreescrito por `DEVICE_PROFILE` al cargar `.env`.

1. La sesión se creó y `WAIT_FOR_ELEMENT` pasó; el proceso terminó silenciosamente al iniciar `CLICK`, sin respuesta ni teardown.
2. Mismo patrón: sesión y wait correctos; terminación silenciosa durante `CLICK`.
3. Terminación silenciosa durante bootstrap.

Veredicto: falla consistente del agente/proceso mobilewright; fallback Appium.

### iOS — 3 intentos frescos

Se reinstaló la `.app` antes de cada intento en el simulador arrancado. Los tres procesos terminaron silenciosamente durante bootstrap, antes de crear una sesión utilizable.

Veredicto: falla consistente; fallback Appium.

## Implementación realizada

- Checkout: modal de confirmación, radiogroup card/cash/PayPal, selección MM/YY, literal API PayPal y campo SA `district` separado.
- Order success: expansión del accordion antes de leer sus detalles.
- Intent genérico `SELECT_OPTION` y acciones Playwright/Appium/mobilewright.
- SA/ar en tipos, rutas, Examples y cargas Gatling; regeneración del feeder de checkout.
- `BROWSERS=chromium,firefox,webkit`, filtro validado, launchers secuencial/paralelo y configuración explícita `DRIVER=playwright`/`PLATFORM=web` para evitar contaminación de `.env`.
- Direcciones loopback normalizadas a `127.0.0.1` para evitar que `localhost` resuelva a `::1` mientras los servidores gRPC escuchan sólo en IPv4.
- axe in-process sobre Playwright con tags WCAG 2.0/2.1 A/AA, `target-size` 2.2 opt-in y gate critical/serious = 0. Es un gate automático, no una certificación WCAG.
- ZAP Automation Framework y MobSF como plugins gRPC; Schemathesis y testssl como acciones del plugin API; runner de comandos sin shell y con timeout.

## Evidencia de validación

| Validación | Resultado |
|---|---|
| `tsc --noEmit` | PASS |
| Parser `BROWSERS` | PASS, 3/3 tests |
| Sintaxis de launchers + JSON de locators | PASS |
| Cucumber dry-run `@a11y or @api` | PASS, 48 scenarios / 248 steps reconocidos |
| Suite API real `@api` | PASS, 46 scenarios / 242 steps en 1m36.221s |
| Android Appium smoke | Sesión/DEEP_LINK/shell del catálogo PASS; FAIL porque el APK no cargó el menú y no existían pizza cards en el árbol UI |
| iOS Appium smoke | BLOCKED: XCUITest arrancó el simulador 26.2, pero WDA no abrió `127.0.0.1:8101`; el `POST /session` expiró tras 360 s |
| Regeneración visual desktop | BLOCKED: `browserType.launch` timeout 180000 ms; intent total 348590.86 ms |
| axe real | BLOCKED por el mismo launch de Playwright |
| `test:parallel-browsers` / `test:all-browsers` | BLOCKED por el mismo launch; no se declara validación real |
| ZAP | BLOCKED: Docker CLI presente, daemon apagado |
| MobSF | BLOCKED: no hay servicio en `127.0.0.1:8000` ni API key operativa |
| Schemathesis | BLOCKED: ejecutable no instalado |
| testssl.sh | BLOCKED: ejecutable no instalado |

La publicación opcional de telemetría a MinIO produjo `ECONNREFUSED :9000` en las suites, sin cambiar sus resultados funcionales.

## Baselines y CI

La regeneración desktop eliminó primero los subárboles locales, como define `visual-regen.js`, pero Chromium no pudo arrancar para recrearlos. Al terminar esta ejecución hay 0 archivos desktop y 35 responsive bajo `visual-baselines/`; esos artefactos están ignorados por Git y no existen en `HEAD`, por lo que no se pueden restaurar desde el checkout.

No se reactivaron triggers `push`/`pull_request`: hacerlo antes de obtener un baseline canónico y una corrida cross-browser real convertiría un bloqueo de infraestructura en ruido permanente de CI. La próxima ejecución debe regenerar/aprobar baselines en un runner donde Playwright complete el handshake y, después, correr ambas matrices antes de reconsiderar los triggers.

## Requisitos para cerrar los gates pendientes

1. Reparar/reinstalar el runtime Chromium de Playwright o usar el runner Linux del workflow canónico; regenerar desktop y responsive.
2. Con Playwright funcional, ejecutar `test:a11y`, `test:parallel-browsers` y `test:all-browsers` contra Render.
3. Levantar Docker y MobSF local; instalar Schemathesis y testssl; proporcionar `MOBSF_API_KEY` y ejecutar los scans con los umbrales definidos.
4. Resolver por qué el APK 1.1.3 no carga el menú contra el backend actual y reparar/precompilar WDA para iOS; después ejecutar las suites Android/iOS completas con Appium.
