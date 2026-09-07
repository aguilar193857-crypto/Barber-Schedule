require('dotenv').config();
const express = require('express');
const path = require('path');
const { db, getConfig, setConfig } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CLAVE_BARBERO = process.env.BARBER_PASSWORD || 'barbero123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Autenticación simple del barbero ----------
// Nota: esto es un control básico para un proyecto pequeño, NO para producción.
function requiereBarbero(req, res, next) {
  const clave = req.header('x-barber-pass');
  if (clave !== CLAVE_BARBERO) {
    return res.status(401).json({ error: 'Clave de barbero incorrecta.' });
  }
  next();
}

app.post('/api/login-barbero', (req, res) => {
  const { clave } = req.body || {};
  if (clave === CLAVE_BARBERO) return res.json({ ok: true });
  res.status(401).json({ ok: false, error: 'Clave incorrecta' });
});

// ---------- Servicios (públicos: solo los activos) ----------
app.get('/api/servicios', (req, res) => {
  const servicios = db.prepare('SELECT * FROM servicios WHERE activo = 1 ORDER BY orden, id').all();
  res.json(servicios);
});

// ---------- Administración de servicios (barbero) ----------
app.get('/api/admin/servicios', requiereBarbero, (req, res) => {
  res.json(db.prepare('SELECT * FROM servicios ORDER BY orden, id').all());
});

app.post('/api/admin/servicios', requiereBarbero, (req, res) => {
  const { nombre, precio, duracion_min } = req.body || {};
  if (!nombre || precio == null || !duracion_min) {
    return res.status(400).json({ error: 'Faltan datos: nombre, precio y duracion_min son obligatorios.' });
  }
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), -1) AS m FROM servicios').get().m;
  const info = db.prepare(`INSERT INTO servicios (nombre, precio, duracion_min, orden)
                            VALUES (?, ?, ?, ?)`).run(nombre.trim(), precio, duracion_min, maxOrden + 1);
  res.status(201).json(db.prepare('SELECT * FROM servicios WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/admin/servicios/:id', requiereBarbero, (req, res) => {
  const existente = db.prepare('SELECT * FROM servicios WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'Servicio no encontrado.' });
  const nombre = req.body.nombre ?? existente.nombre;
  const precio = req.body.precio ?? existente.precio;
  const duracion_min = req.body.duracion_min ?? existente.duracion_min;
  const activo = req.body.activo ?? existente.activo;
  db.prepare(`UPDATE servicios SET nombre = ?, precio = ?, duracion_min = ?, activo = ? WHERE id = ?`)
    .run(nombre, precio, duracion_min, activo ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM servicios WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/servicios/:id', requiereBarbero, (req, res) => {
  db.prepare('DELETE FROM servicios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Crear cita (cliente, público, sin login) ----------
app.post('/api/citas', (req, res) => {
  const { nombre, telefono, servicio, fecha, hora, notas } = req.body || {};
  if (!nombre || !telefono || !servicio || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos: nombre, telefono, servicio, fecha y hora son obligatorios.' });
  }

  let cliente = db.prepare('SELECT * FROM clientes WHERE telefono = ?').get(telefono.trim());
  if (!cliente) {
    const info = db.prepare('INSERT INTO clientes (nombre, telefono) VALUES (?, ?)')
      .run(nombre.trim(), telefono.trim());
    cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  } else if (cliente.nombre !== nombre.trim()) {
    // Si el nombre cambió (ej. lo escribió distinto), lo actualizamos
    db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?').run(nombre.trim(), cliente.id);
  }

  const info = db.prepare(`INSERT INTO citas (cliente_id, servicio, fecha, hora, notas)
                            VALUES (?, ?, ?, ?, ?)`)
    .run(cliente.id, servicio, fecha, hora, notas || null);

  const cortesFaltantes = Number(getConfig('cortes_para_gratis', 11)) - 1 - cliente.cortes_acumulados;
  res.status(201).json({
    ok: true,
    cita_id: info.lastInsertRowid,
    mensaje: `Cita agendada para ${fecha} a las ${hora}.`,
    cortes_acumulados: cliente.cortes_acumulados,
    faltan_para_gratis: Math.max(cortesFaltantes, 0),
  });
});

// ---------- Panel del barbero ----------

// Todas las citas (opcionalmente filtradas por fecha o estado)
app.get('/api/citas', requiereBarbero, (req, res) => {
  const { fecha, estado, fecha_inicio, fecha_fin } = req.query;
  let sql = `SELECT citas.*, clientes.nombre, clientes.telefono, clientes.cortes_acumulados
             FROM citas JOIN clientes ON clientes.id = citas.cliente_id WHERE 1=1`;
  const params = [];
  if (fecha) { sql += ' AND citas.fecha = ?'; params.push(fecha); }
  if (fecha_inicio && fecha_fin) {
    sql += ' AND citas.fecha BETWEEN ? AND ?';
    params.push(fecha_inicio, fecha_fin);
  }
  if (estado) { sql += ' AND citas.estado = ?'; params.push(estado); }
  sql += ' ORDER BY citas.fecha ASC, citas.hora ASC';
  res.json(db.prepare(sql).all(...params));
});

// Cambiar estado de una cita (completada / cancelada) y aplicar lógica de fidelidad
app.patch('/api/citas/:id', requiereBarbero, (req, res) => {
  const { estado } = req.body || {};
  if (!['pendiente', 'completada', 'cancelada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(req.params.id);
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada.' });

  let gratis = cita.gratis;
  if (estado === 'completada' && cita.estado !== 'completada') {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cita.cliente_id);
    const meta = Number(getConfig('cortes_para_gratis', 11));
    const nuevoAcumulado = cliente.cortes_acumulados + 1;
    if (nuevoAcumulado >= meta) {
      gratis = 1;
      db.prepare('UPDATE clientes SET cortes_acumulados = 0 WHERE id = ?').run(cliente.id);
    } else {
      gratis = 0;
      db.prepare('UPDATE clientes SET cortes_acumulados = ? WHERE id = ?').run(nuevoAcumulado, cliente.id);
    }
  }

  db.prepare('UPDATE citas SET estado = ?, gratis = ? WHERE id = ?').run(estado, gratis, req.params.id);
  res.json({ ok: true, gratis: !!gratis });
});

// Lista de clientes con su última visita, fidelidad y alerta de contacto
app.get('/api/clientes', requiereBarbero, (req, res) => {
  const diasAlerta = Number(getConfig('dias_alerta', 30));
  const clientes = db.prepare('SELECT * FROM clientes').all();
  const metaFidelidad = Number(getConfig('cortes_para_gratis', 11));

  const resultado = clientes.map((c) => {
    const ultima = db.prepare(`SELECT fecha FROM citas WHERE cliente_id = ? AND estado = 'completada'
                                ORDER BY fecha DESC LIMIT 1`).get(c.id);
    let diasDesdeUltima = null;
    let alerta = false;
    if (ultima) {
      const dias = Math.floor((Date.now() - new Date(ultima.fecha).getTime()) / 86400000);
      diasDesdeUltima = dias;
      alerta = dias >= diasAlerta;
    }
    return {
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      ultima_visita: ultima ? ultima.fecha : null,
      dias_desde_ultima: diasDesdeUltima,
      alerta_contactar: alerta,
      cortes_acumulados: c.cortes_acumulados,
      faltan_para_gratis: Math.max(metaFidelidad - 1 - c.cortes_acumulados, 0),
    };
  });

  resultado.sort((a, b) => (b.dias_desde_ultima ?? -1) - (a.dias_desde_ultima ?? -1));
  res.json(resultado);
});

// Configuración (días de alerta y meta de fidelidad)
app.get('/api/config', requiereBarbero, (req, res) => {
  res.json({
    dias_alerta: Number(getConfig('dias_alerta', 30)),
    cortes_para_gratis: Number(getConfig('cortes_para_gratis', 11)),
  });
});
app.put('/api/config', requiereBarbero, (req, res) => {
  const { dias_alerta, cortes_para_gratis } = req.body || {};
  if (dias_alerta) setConfig('dias_alerta', dias_alerta);
  if (cortes_para_gratis) setConfig('cortes_para_gratis', cortes_para_gratis);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Barbería corriendo en http://localhost:${PORT}`);
});
