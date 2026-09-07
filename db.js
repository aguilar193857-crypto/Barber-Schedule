const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const carpetaDatos = path.join(__dirname, 'data');
if (!fs.existsSync(carpetaDatos)) fs.mkdirSync(carpetaDatos, { recursive: true });

const db = new DatabaseSync(path.join(carpetaDatos, 'barberia.db'));
db.exec('PRAGMA journal_mode = WAL;');

// ---------- Esquema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  cortes_acumulados INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  servicio TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada | cancelada
  gratis INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  precio INTEGER NOT NULL DEFAULT 0,
  duracion_min INTEGER NOT NULL DEFAULT 30,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);
`);

// Sembrar servicios por defecto solo la primera vez (tabla vacía)
const totalServicios = db.prepare('SELECT COUNT(*) AS n FROM servicios').get().n;
if (totalServicios === 0) {
  const insertar = db.prepare(`INSERT INTO servicios (nombre, precio, duracion_min, orden)
                                VALUES (?, ?, ?, ?)`);
  const porDefecto = [
    ['Corte clásico', 20000, 30],
    ['Corte + barba', 30000, 45],
    ['Arreglo de barba', 15000, 20],
    ['Diseño / línea', 10000, 20],
    ['Afeitado clásico', 20000, 30],
  ];
  porDefecto.forEach(([nombre, precio, duracion], i) => insertar.run(nombre, precio, duracion, i));
}

const META_TABLE = `
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;
db.exec(META_TABLE);

function getConfig(clave, porDefecto) {
  const fila = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave);
  return fila ? fila.valor : porDefecto;
}
function setConfig(clave, valor) {
  db.prepare(`INSERT INTO config (clave, valor) VALUES (?, ?)
              ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).run(clave, String(valor));
}

// Días de inactividad antes de sugerir contactar al cliente
if (!getConfig('dias_alerta', null)) setConfig('dias_alerta', 30);
// Cuántos cortes acumulados dan derecho al gratis (10 cortes -> el 11 gratis)
if (!getConfig('cortes_para_gratis', null)) setConfig('cortes_para_gratis', 11);

module.exports = { db, getConfig, setConfig };
