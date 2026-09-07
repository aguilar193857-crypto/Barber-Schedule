# Barbería El Filo — Sistema de citas

Página web para que los clientes agenden citas, el barbero organice su día,
se sepa la última visita de cada cliente y se lleve el conteo del club de
fidelidad ("10 cortes y el 11 gratis") sin depender de papel.

## ¿Qué incluye?

- **`/` (index.html):** formulario público para que el cliente agende cita (nombre, teléfono, servicio, fecha, hora). No necesita registrarse.
- **`/panel.html`:** panel del barbero (protegido con una clave) con estas pestañas:
  - **Citas:** ver, filtrar y marcar citas como completadas o canceladas.
  - **Calendario semanal:** vista de la semana (lunes a domingo) con las citas de cada día, con botones para ir a la semana anterior/siguiente.
  - **Clientes para contactar:** lista automática de clientes que llevan más de X días sin venir (configurable), para que el barbero los contacte.
  - **Fidelidad:** progreso de cada cliente hacia su corte número 11 gratis.
  - **Servicios y precios:** el barbero agrega, edita, desactiva o elimina servicios y precios sin tocar el código.
- **Base de datos SQLite** (`data/barberia.db`): guarda clientes, citas, servicios y el conteo de cortes — no se pierde como un papel físico. Usa el módulo `node:sqlite` que viene incluido en Node.js (no requiere instalar ni compilar nada aparte).

## Cómo funciona la fidelidad y las alertas

- Cada vez que el barbero marca una cita como **completada**, se suma 1 al contador del cliente.
- Al llegar a 11 cortes acumulados, ese corte se marca automáticamente como **GRATIS** y el contador se reinicia a 0.
- Cada cliente guarda la fecha de su última cita completada. Si pasan más de `dias_alerta` (30 por defecto) sin una cita completada, aparece en la pestaña "Clientes para contactar".

## Instalar y correr

Necesitas [Node.js](https://nodejs.org/) instalado, **versión 22.5 o superior** (usa el comando `node -v` para revisar la tuya). Esta versión ya trae soporte para SQLite integrado, así que no hay que instalar ni compilar ninguna base de datos aparte.

```bash
git clone <URL-de-tu-repositorio>
cd barberia-app
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:3000` para la vista del cliente
y `http://localhost:3000/panel.html` para el panel del barbero.

**Clave del barbero por defecto:** `barbero123` (cámbiala en el archivo `.env`, variable `BARBER_PASSWORD`).

## Estructura del proyecto

```
barberia-app/
├── server.js          # Servidor Express y rutas de la API
├── db.js              # Conexión y esquema de la base de datos SQLite
├── data/              # Aquí se guarda barberia.db (no se sube a Git)
├── public/
│   ├── index.html     # Página del cliente (agendar cita)
│   ├── panel.html      # Panel del barbero
│   ├── css/estilos.css
│   └── js/
│       ├── cliente.js
│       └── panel.js
├── .env.example
└── package.json
```

## Notas / posibles mejoras a futuro

- El login del barbero es una clave simple guardada en el navegador (sessionStorage). Sirve para un proyecto pequeño, pero para producción real convendría un sistema de usuarios con contraseñas encriptadas.
- Las "notificaciones" de clientes inactivos se muestran dentro del panel (no se envían automáticamente por WhatsApp/SMS/correo); si se quiere automatizar el envío, se podría integrar una API de mensajería más adelante.
- El calendario muestra la semana completa aunque haya pocas citas; para un negocio con mucho movimiento se podría agregar una vista por horas.
- SQLite en Node.js todavía se marca como "experimental" (verás una advertencia al iniciar el servidor); funciona bien para este proyecto, pero podría cambiar en versiones futuras de Node.
