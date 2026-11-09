# Reflexión · Práctica CI/CD con Firebase Hosting

**Alumno:** Claudio David Pereyra
**Repo:** https://github.com/davidcpz/practica-firebase-cicd-david
**Producción:** https://practica-firebase-a1181.web.app
**PR mergeado con preview:** https://github.com/davidcpz/practica-firebase-cicd-david/pull/4

---

## Mediciones de headers

### Antes (B1) — producción sin headers configurados

```
▶ HTML: https://practica-firebase-a1181.web.app/
  status 200
  ✘ content-security-policy (falta)
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✘ x-content-type-options (falta)
  ✘ x-frame-options (falta)
  ✘ referrer-policy (falta)
  ✘ permissions-policy (falta)
  · cache-control: max-age=3600

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✘ cache-control: max-age=3600

❌ 6 control(es) pendiente(s).
```

Observación: HSTS aparece aunque no lo configuramos porque los dominios `*.web.app` están en la lista de precarga HSTS de los navegadores y Google lo envía por defecto. Por la misma razón, el valor que llega es el de Google y no el que pusimos en `firebase.json`.

### Después (B5) — producción tras mergear el PR #4

```
▶ HTML: https://practica-firebase-a1181.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' https://picsum.photos …
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  · cache-control: no-cache

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

---

## Registro de lo que pasó (problemas encontrados)

1. **El emulador local no aplicó los headers.** Con `npm run serve`, `check-headers.mjs` contra `http://localhost:5000` y `http://127.0.0.1:5000` daba los 7 controles en falta, aunque `firebase.json` era válido (verificado con `Get-Content`). Para no frenar la práctica validé en un preview channel real (`npm run deploy:preview` → canal `local-test`), donde los headers sí se aplicaban. Es justamente el rol de un preview: probar en un entorno idéntico a producción.
2. **La CSP estricta rompió la app** (ver pregunta 4).
3. **La imagen de portada venía de dos orígenes**: `picsum.photos` responde con un 302 hacia `fastly.picsum.photos`. Recién después de permitir el primero se pudo ver el segundo en la pestaña Network.
4. **Caché del navegador**: después de redeployar, el navegador seguía mostrando la CSP vieja (el documento volvía con 304). Se resolvió con "Disable cache" y recarga forzada, y motivó el `Cache-Control: no-cache` del HTML.
5. **El rollback quitó los headers**: al hacer rollback desde la consola, producción volvió a `c301a3a` y `check-headers.mjs` volvió a dar 6 pendientes. Restauré con `firebase hosting:clone practica-firebase-a1181:pr4-feat-headers practica-firebase-a1181:live`.

---

## Preguntas de reflexión

### 1. ¿Por qué el preview tiene vencimiento? ¿Qué riesgos tendría un preview que no vence nunca?

Configuré `expires: 3d`. Un preview es una URL pública con código que todavía no fue revisado ni aprobado. Si no vence:

- Quedan accesibles versiones viejas con **bugs o vulnerabilidades ya corregidas en producción**: un atacante podría explotar la versión vieja aunque producción esté parcheada.
- Pueden exponer **features no lanzadas** o datos de prueba.
- Se acumulan canales (Firebase tiene límite de canales por sitio) y se pierde el control de qué está publicado.
- Si la configuración apunta a backends reales, siguen consumiendo recursos.

El vencimiento hace que el entorno sea efímero: existe solo mientras dura la revisión.

### 2. ¿Qué diferencia hay entre desplegar y liberar? ¿Dónde aparece cada concepto en este flujo?

- **Desplegar** es compilar y subir una versión a la infraestructura. En este flujo, cada PR **despliega** a un preview channel: la versión existe y tiene URL, pero los usuarios no la ven.
- **Liberar** es hacer que esa versión sea la que reciben los usuarios. Pasa cuando algo se publica en el canal `live`.

En el flujo aparecen así:
- El **merge a `main`** despliega y libera a la vez (el workflow compila y publica en `live`).
- El **rollback** de la consola es liberar sin desplegar: vuelve a hacer visible una versión que ya existía.
- `hosting:clone` del preview a `live` también libera sin desplegar: promueve exactamente los archivos ya compilados del PR. Lo comprobé porque el footer de producción pasó a mostrar `fb5312d` / rama `feat/headers`, que es el build del preview, no un build nuevo de `main`.

### 3. ¿Por qué la clave de la service account va en un secreto y no en el repo? ¿Qué podría hacer alguien que la obtenga? ¿Cómo limitarías el daño?

El repo es **público**: cualquier archivo commiteado queda expuesto, incluso si se borra después, porque queda en el historial de git. Los secretos de GitHub Actions se guardan cifrados, no se muestran en los logs y no se exponen a PRs que vienen de forks.

Con la clave, alguien podría **desplegar cualquier contenido en mi dominio** (phishing o malware bajo `practica-firebase-a1181.web.app`), borrar canales, hacer rollbacks o, según los roles que tenga la service account, acceder a otros servicios del proyecto.

Para limitar el daño:
- **Mínimo privilegio**: que la service account solo tenga el rol *Firebase Hosting Admin*, no Editor ni Owner del proyecto.
- **Rotar** la clave periódicamente y revocarla de inmediato si se filtra.
- Reemplazar la clave JSON por **Workload Identity Federation (OIDC)**: GitHub obtiene credenciales temporales sin que exista una clave de larga duración.
- Proteger el deploy a producción con el **environment `production`** (aprobación manual) y limitar qué ramas pueden usarlo.

### 4. La CSP rompió la app: ¿por qué? ¿Qué opciones evaluaste y qué costo de seguridad tiene cada una?

Con `script-src 'self'` la consola mostró errores como:

```
Executing inline script violates the following Content Security Policy directive 'script-src 'self''.
Either the 'unsafe-inline' keyword, a hash ('sha256-ohBYDP4j...'), or a nonce ('nonce-...') is required
to enable inline execution. The action has been blocked.
```

**Por qué:** Next.js con export estático inserta **scripts inline** en el HTML (`<script>self.__next_f.push(...)</script>`, visibles en `out/cursos.html`) con los datos que React necesita para hidratar la página. `'self'` solo permite scripts cargados desde archivos del propio origen, no código embebido en el HTML. Sin esos scripts, React no hidrata: la página se ve, pero el filtro de `/cursos` no responde.

Además, la imagen de portada estaba bloqueada por `img-src 'self'`.

**Opciones evaluadas:**

| Opción | Costo de seguridad |
|---|---|
| `'unsafe-inline'` en `script-src` (**elegida**) | Alto. Permite ejecutar *cualquier* script inline, así que si existiera una inyección XSS en el HTML, la CSP ya no la frenaría. Se mantiene la protección contra scripts de **otros orígenes** (`'self'`) y el resto de directivas (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`). En este sitio el riesgo es bajo porque es estático y no renderiza contenido ingresado por usuarios. |
| Nonces (`'nonce-...'`) | No aplica: el nonce debe ser aleatorio **por request** y requiere un servidor que lo genere. Con export estático el HTML es el mismo para todos. |
| Hashes (`'sha256-...'`) | Bajo. Solo se ejecutan los scripts inline exactos que generó el build. Costo operativo: los hashes cambian en cada build, así que hay que calcularlos en el pipeline (ver desafío extra). |
| Sacar la CSP o usar `'unsafe-eval'` / `*` | Inaceptable: anula la protección. |

**Imagen:** en Network se ve que `picsum.photos` redirige con un 302 a `fastly.picsum.photos`, así que hay que permitir **los dos orígenes exactos**: `img-src 'self' https://picsum.photos https://fastly.picsum.photos`. Elegí no usar `https:` ni `*` para no abrir la carga de imágenes a cualquier dominio.

**Política final:**
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self';
img-src 'self' https://picsum.photos https://fastly.picsum.photos;
object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

**Desafío extra (CSP sin `'unsafe-inline'`):** se puede agregar un paso en el workflow **después de `npm run build` y antes del deploy** que:
1. recorra los `.html` de `out/`,
2. extraiga el contenido de cada `<script>` sin `src`,
3. calcule `sha256` en base64 de ese contenido exacto (por ejemplo, con `crypto.createHash('sha256').update(contenido).digest('base64')` en Node),
4. reescriba el header CSP en `firebase.json` con `script-src 'self' 'sha256-...' 'sha256-...'`.

Tiene que hacerse en el pipeline porque los scripts inline cambian con cada build. Los mismos hashes que calcula el navegador aparecen en los errores de la consola, lo que sirve para verificarlos.

### 5. Para cada header de B2, ¿qué ataque mitiga?

| Header | Valor | Ataque que mitiga |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | **Downgrade a HTTP / SSL stripping** (man-in-the-middle): obliga al navegador a usar siempre HTTPS durante un año, incluso si el usuario escribe `http://`. En `*.web.app` Google ya lo fuerza con `preload`. |
| `X-Content-Type-Options` | `nosniff` | **MIME sniffing**: impide que el navegador "adivine" que un archivo (por ejemplo, un `.txt` o una imagen subida) es un script y lo ejecute. |
| `X-Frame-Options` | `DENY` | **Clickjacking**: impide que otro sitio embeba el mío en un iframe invisible para engañar al usuario y hacerlo clickear. Refuerza lo que hace `frame-ancestors 'none'` en la CSP, para navegadores viejos. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | **Fuga de información en la URL**: a otros sitios solo se envía el origen (`https://practica-firebase-a1181.web.app`), no la ruta ni los parámetros, que podrían tener datos sensibles. Si se pasa de HTTPS a HTTP no se envía nada. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | **Abuso de APIs del navegador**: si se inyectara código o un iframe malicioso, no podría pedir acceso a cámara, micrófono, ubicación, pagos ni USB. El sitio no usa ninguna. |

### 6. ¿Por qué los assets de `/_next/static/` pueden cachearse un año y el HTML no?

Los archivos de `/_next/static/` tienen un **hash del contenido en el nombre** (por ejemplo `1x6obpmlu1_c2.js`). Si el contenido cambia, el nombre cambia, así que una URL dada **nunca** cambia de contenido. Por eso se pueden marcar `public, max-age=31536000, immutable`: el navegador no vuelve a preguntar y la carga es más rápida.

El HTML, en cambio, tiene siempre la **misma URL** (`/`, `/cursos`) y es el que referencia qué assets cargar. Si se cacheara una hora (el `max-age=3600` por defecto), después de un deploy o un **rollback** los usuarios seguirían viendo la versión anterior durante ese tiempo. Con `no-cache` el navegador guarda el HTML, pero revalida con el servidor antes de usarlo (respuesta 304 si no cambió), así que los cambios se ven al instante.

**Impacto en deploys y rollbacks:** lo comprobé en la práctica. Al hacer rollback, el footer mostró el SHA anterior apenas recargué, sin esperar a que venciera la caché. Los assets viejos y nuevos conviven sin conflicto porque tienen nombres distintos. Antes de configurar esto, en las pruebas el navegador me mostraba la CSP vieja por usar el HTML cacheado.

La regla específica de `/_next/static/**` va **después** de la general `**` porque, cuando dos reglas matchean la misma URL, gana la última.

### 7. Si la app necesitara SSR, ¿qué cambiaría en la arquitectura, en la CSP y en el costo?

- **Arquitectura:** Firebase Hosting (plan Spark) solo sirve archivos estáticos. Con SSR, Server Actions o rutas dinámicas habría que usar **Firebase App Hosting**, que corre la app de Next.js en **Cloud Run** (contenedores). Hay un servidor que genera el HTML en cada request, con cold starts, escalado y logs de servidor que monitorear. Los previews y rollbacks pasan a ser revisiones de Cloud Run.
- **CSP:** mejoraría. Con un servidor se puede generar un **nonce aleatorio por request** (por ejemplo, en el middleware de Next.js) e inyectarlo en cada `<script>` y en el header CSP, eliminando `'unsafe-inline'` sin tener que calcular hashes. Los headers también podrían definirse desde el código (middleware o `next.config`) además de `firebase.json`.
- **Costo:** App Hosting requiere el **plan Blaze** (pago por uso, con cuenta de facturación y tarjeta). Se paga por CPU, memoria, requests y egress de Cloud Run. Ya no sería costo cero garantizado, aunque Blaze tiene una capa gratuita. Conviene configurar alertas de presupuesto.

---

## Pregunta para pensar (A6): después del rollback, `main` sigue teniendo el código nuevo

Después del rollback, producción y `main` quedan **desincronizados**: `live` sirve una versión vieja, pero `main` tiene el código nuevo. En el **próximo merge** el pipeline compila `main` completo y lo publica, así que el código que se había revertido **vuelve a producción**, junto con el bug que motivó el rollback, salvo que se haya corregido.

En un equipo real se resuelve así:
- El rollback se usa como **mitigación rápida**, no como solución.
- Inmediatamente después se hace un **`git revert`** del commit problemático en `main` (por PR, con su preview) o un **fix hacia adelante**, para que el repo vuelva a reflejar lo que debe estar en producción.
- Se puede **congelar los merges** a `main` (protección de rama, o pausar el deploy con la aprobación manual del environment `production`) hasta que el fix esté listo.

En mi caso, además, el rollback **quitó los headers de seguridad**, porque Firebase versiona archivos y `firebase.json` juntos. Es un ejemplo de que un rollback por un problema funcional también puede revertir una corrección de seguridad.

---

## Opcionales realizados

- **A4 · Concurrency:** el preview usa `group: preview-<número de PR>` con `cancel-in-progress: true` (un push nuevo cancela el build anterior). Producción usa `group: deploy-production` con `cancel-in-progress: false` (los deploys esperan en fila y nunca se cortan a la mitad).
- **A5 · Environment `production`:** el job de producción está asociado al environment. En *Settings → Environments* se puede activar *Required reviewers* para exigir una aprobación manual antes de cada deploy. No lo dejé activo para no bloquear la práctica, pero en un equipo real es el "gate" entre el merge y la liberación.
- **A6 bonus · `hosting:clone`:** promoví el preview del PR #4 a `live` sin recompilar.
