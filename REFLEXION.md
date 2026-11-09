# Reflexión · Clase 2 · SQL Connect

**Alumno:** Claudio David Pereyra
**Repo:** https://github.com/davidcpz/practica-firebase-cicd-david

## Auditoría de seguridad (`npm run atacar`)

### Antes de corregir L4

```
✔ ListCursos responde sin login (7 cursos) — público por diseño
✘ ListAlumnos devuelve datos personales SIN login
    Ejemplo filtrado: {"email":"ana@ejemplo.test","id":"seed-uid-ana","nombre":"Ana Ficticia"}
✔ Inscribirme rechazada sin login
    unauthenticated: this operation requires a signed-in user
✔ Inscribirme es idempotente (repetir no falla)
✔ MisInscripciones solo devuelve lo del usuario que llama
✔ B no puede dar de baja a A

❌ 1 vulnerabilidad(es) · 0 pendiente(s)
```

### Después de corregir L4 (`ListAlumnos` → `NO_ACCESS`)

```
✔ ListCursos responde sin login (7 cursos) — público por diseño
✔ ListAlumnos rechazada para un cliente
    unauthorized: you are not authorized to perform this operation
✔ Inscribirme rechazada sin login
    unauthenticated: this operation requires a signed-in user
✔ Inscribirme es idempotente (repetir no falla)
✔ MisInscripciones solo devuelve lo del usuario que llama
✔ B no puede dar de baja a A

✅ Todos los controles pasaron
```

---

## Preguntas

### 1. ¿Por qué ninguna operación recibe el id del alumno como variable? ¿Qué es IDOR y cómo lo evita `auth.uid`?

IDOR (*Insecure Direct Object Reference*) ocurre cuando una API usa un identificador que manda el cliente para decidir a qué datos acceder, sin verificar que le pertenezcan. Si `MisInscripciones` recibiera `$alumnoId`, cualquiera podría mandar el id de otra persona y leer sus inscripciones. Lo mismo pasaría con `Inscribirme` o `DarmeDeBaja`: se podría inscribir o dar de baja a otro.

Por eso ninguna operación acepta el id del alumno. El servidor lo toma del token de Firebase Auth con `auth.uid` (`alumnoId_expr: "auth.uid"`, `alumno(key: { id_expr: "auth.uid" })`). El token está firmado por Google y el cliente no lo puede falsificar, así que cada usuario solo puede operar sobre sus propios datos. El cliente elige el curso, pero nunca el alumno.

### 2. `ListCursos` es `PUBLIC` y `ListAlumnos` terminó en `NO_ACCESS`. ¿Qué criterio usaste? ¿Cómo haría el panel de admin para listar alumnos?

El criterio es el **tipo de dato** y el **principio de mínimo privilegio**:

- `ListCursos` devuelve el catálogo, que es información pública: cualquiera tiene que poder verlo antes de crear una cuenta.
- `ListAlumnos` devuelve **datos personales** (nombre, email y UID) de todos los alumnos. Estaba en `PUBLIC`, así que cualquier persona sin cuenta podía descargar la lista completa. `USER` tampoco alcanzaba, porque cualquiera puede registrarse gratis y leerla igual. La app pública no necesita esta operación, por eso quedó en `NO_ACCESS`: nadie la puede ejecutar desde un cliente.

Para el panel de admin hay dos alternativas que no exponen datos:

- **Desde el servidor:** el Admin SDK, una Cloud Function o `firebase dataconnect:execute` usan credenciales de administrador (service account) y no pasan por el `@auth` del cliente. `NO_ACCESS` solo bloquea a los clientes.
- **Con un rol en el token:** asignarles a los administradores un *custom claim* (`admin: true`) desde el servidor, y declarar la operación como `@auth(level: USER, expr: "auth.token.admin == true")`. Así solo los usuarios marcados como admin pueden ejecutarla, y el claim tampoco lo puede falsificar el cliente.

### 3. ¿Qué ventaja tiene una clave primaria compuesta en `Matricula` frente a validar duplicados en el código del cliente?

La clave compuesta `(alumnoId, cursoId)` hace que **PostgreSQL** garantice que no existan dos filas para el mismo alumno en el mismo curso. La regla vive en la base de datos y se cumple siempre, sin importar quién llame a la API ni cómo.

Si la validación estuviera en el código del cliente, no serviría de nada: el cliente es público y cualquiera puede saltearlo llamando a la API directamente, como hace `npm run atacar`. Además, dos pedidos simultáneos podrían pasar la validación al mismo tiempo (condición de carrera). Con un UUID propio en `Matricula`, la base aceptaría duplicados con distinto id.

Además, la clave compuesta es la que permite que `Inscribirme` sea idempotente con `matricula_upsert`: si la fila ya existe, se actualiza en vez de duplicarse. Con `matricula_insert`, el segundo intento fallaría por clave duplicada. Como mejora adicional se podría controlar el **cupo** del curso, ya que hoy nada impide superar el `cupo` definido en `Curso`.

### 4. La configuración de Firebase (`apiKey`, etc.) es pública. ¿Por qué no compromete la base de datos? ¿Qué capa faltaría para frenar a alguien que usa esa config desde un script?

El `apiKey` no es una contraseña: solo identifica el proyecto. Viaja en el bundle de JavaScript y cualquiera lo ve en el navegador. La seguridad no depende de esconderlo, sino de dos cosas:

- **Firebase Auth**, que emite tokens firmados que no se pueden falsificar.
- Las reglas **`@auth`** de cada operación, que se evalúan en el servidor. Además, el cliente solo puede ejecutar las operaciones con nombre definidas de antemano, nunca SQL arbitrario.

Lo comprobé en la práctica: `npm run atacar` usa exactamente esa config pública y no pudo leer datos personales ni operar sobre datos de otro usuario.

Lo que falta es **App Check**. Hoy cualquiera puede usar la config desde un script propio, fuera de la app, y por ejemplo crear cuentas automáticamente o consumir la cuota de operaciones con `ListCursos`. App Check verifica, con reCAPTCHA Enterprise o attestation del dispositivo, que el pedido venga de la app legítima y no de un script.

### 5. Comparado con una API REST propia (Express + pg), ¿qué te da SQL Connect y qué perdés?

**Lo que da:**
- No hay servidor que mantener, escalar ni parchear.
- La inyección SQL queda cerrada por diseño: el cliente manda el nombre de la operación y sus variables, nunca SQL.
- La autorización se declara junto a cada operación (`@auth`) en lugar de quedar dispersa en middlewares, y es fácil de auditar.
- Viene integrado con Firebase Auth (`auth.uid`, `auth.token.email`) y genera queries y mutations a partir del esquema.
- Incluye migraciones del esquema y emuladores locales.

**Lo que se pierde:**
- Flexibilidad para lógica de negocio compleja (por ejemplo, validar el cupo con reglas elaboradas, llamar a otros servicios o mandar emails). Para eso hacen falta Cloud Functions.
- Control fino sobre el SQL generado y sobre la optimización de consultas.
- Dependencia de Google Cloud (*vendor lock-in*) y de su modelo de precios: después de la prueba de 90 días hay que pasar al plan Blaze.
- Menor portabilidad: el esquema `.gql` y las directivas son propios de SQL Connect.

Frente a **Firestore Rules**, la idea es parecida (reglas declarativas evaluadas en el servidor), pero en Firestore las reglas protegen documentos y el cliente puede armar sus propias consultas. En SQL Connect, el cliente solo ejecuta operaciones predefinidas, cada una con su `@auth`, sobre un modelo relacional con claves foráneas y restricciones reales.

### 6. ¿Por qué no alcanzó con la CSP de la clase 1 y por qué conviene listar dominios exactos en `connect-src`?

En la clase 1, `connect-src` era `'self'`, porque la app no hacía pedidos a otros orígenes: los cursos estaban en el código. Ahora el navegador habla directamente con Google:

- `https://identitytoolkit.googleapis.com`: Firebase Auth (registro e inicio de sesión).
- `https://securetoken.googleapis.com`: Firebase Auth (renovación del token).
- `https://firebasedataconnect.googleapis.com`: SQL Connect (ejecución de las operaciones).

Con `'self'`, el navegador bloquea esos pedidos (`Refused to connect`) y la app no puede cargar el catálogo ni iniciar sesión. En el preview verifiqué en la consola del navegador que los pedidos a `identitytoolkit.googleapis.com` ya no se bloquean.

Conviene listar dominios exactos y no `https://*.googleapis.com` por mínimo privilegio. El comodín habilita cientos de APIs de Google, algunas capaces de recibir datos (por ejemplo, Cloud Storage). Si un atacante lograra inyectar un script (XSS), podría exfiltrar datos hacia un recurso propio alojado en `googleapis.com`. Con la lista exacta, la CSP solo permite conectarse a los tres servicios que la app necesita.

Además, la CSP no usa `'unsafe-inline'` en `script-src`. Agregué al pipeline de GitHub Actions el paso `node scripts/csp-hashes.mjs`, que después del build calcula el SHA-256 de cada script inline del export estático y reemplaza el marcador `__INLINE_SCRIPT_HASHES__` de `firebase.json`.
