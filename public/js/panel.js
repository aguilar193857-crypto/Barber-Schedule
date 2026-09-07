let clavePorFecha = sessionStorage.getItem('claveBarbero') || '';

const pantallaLogin = document.getElementById('pantalla-login');
const panelPrincipal = document.getElementById('panel-principal');
const errorLogin = document.getElementById('error-login');

async function intentarEntrar(clave) {
  const res = await fetch('/api/login-barbero', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave }),
  });
  if (res.ok) {
    clavePorFecha = clave;
    sessionStorage.setItem('claveBarbero', clave);
    pantallaLogin.classList.add('oculto');
    panelPrincipal.classList.remove('oculto');
    cargarCitas();
  } else {
    errorLogin.innerHTML = `<div class="aviso error">Clave incorrecta.</div>`;
  }
}

document.getElementById('btn-entrar').addEventListener('click', () => {
  intentarEntrar(document.getElementById('clave').value);
});
document.getElementById('clave').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') intentarEntrar(e.target.value);
});

// Si ya había una clave guardada en esta pestaña, probarla directo
if (clavePorFecha) intentarEntrar(clavePorFecha);

function cabeceras() {
  return { 'Content-Type': 'application/json', 'x-barber-pass': clavePorFecha };
}

// ---------- Pestañas ----------
const TABS = ['citas', 'calendario', 'clientes', 'fidelidad', 'servicios'];
document.querySelectorAll('.pestanas button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pestanas button').forEach((b) => b.classList.remove('activa'));
    btn.classList.add('activa');
    TABS.forEach((t) => {
      document.getElementById(`tab-${t}`).classList.toggle('oculto', t !== btn.dataset.tab);
    });
    if (btn.dataset.tab === 'clientes' || btn.dataset.tab === 'fidelidad') cargarClientes();
    if (btn.dataset.tab === 'calendario') cargarCalendario();
    if (btn.dataset.tab === 'servicios') cargarServiciosAdmin();
  });
});

// ---------- Citas ----------
async function cargarCitas() {
  const fecha = document.getElementById('filtro-fecha').value;
  const estado = document.getElementById('filtro-estado').value;
  const params = new URLSearchParams();
  if (fecha) params.set('fecha', fecha);
  if (estado) params.set('estado', estado);

  const res = await fetch(`/api/citas?${params}`, { headers: cabeceras() });
  const citas = await res.json();
  const tbody = document.querySelector('#tabla-citas tbody');
  tbody.innerHTML = citas.map((c) => filaCita(c)).join('') ||
    '<tr><td colspan="7" style="color:var(--crema-tenue)">No hay citas para este filtro.</td></tr>';

  tbody.querySelectorAll('button[data-accion]').forEach((btn) => {
    btn.addEventListener('click', () => cambiarEstado(btn.dataset.id, btn.dataset.accion));
  });
}

function filaCita(c) {
  const colorEstado = c.estado === 'completada' ? 'verde' : c.estado === 'cancelada' ? 'roja' : '';
  const gratis = c.gratis ? ' <span class="etiqueta roja">GRATIS 🎉</span>' : '';
  let acciones = '';
  if (c.estado === 'pendiente') {
    acciones = `
      <button data-accion="completada" data-id="${c.id}" class="ok">Completar</button>
      <button data-accion="cancelada" data-id="${c.id}" class="peligro">Cancelar</button>`;
  }
  return `<tr>
    <td>${c.fecha}</td>
    <td>${c.hora}</td>
    <td>${c.nombre}</td>
    <td>${c.telefono}</td>
    <td>${c.servicio}${gratis}</td>
    <td><span class="etiqueta ${colorEstado}">${c.estado}</span></td>
    <td>${acciones}</td>
  </tr>`;
}

async function cambiarEstado(id, estado) {
  await fetch(`/api/citas/${id}`, {
    method: 'PATCH',
    headers: cabeceras(),
    body: JSON.stringify({ estado }),
  });
  cargarCitas();
}

document.getElementById('btn-recargar-citas').addEventListener('click', cargarCitas);
document.getElementById('filtro-fecha').addEventListener('change', cargarCitas);
document.getElementById('filtro-estado').addEventListener('change', cargarCitas);

// ---------- Clientes / alertas / fidelidad ----------
async function cargarClientes() {
  const res = await fetch('/api/clientes', { headers: cabeceras() });
  const clientes = await res.json();

  const alertas = clientes.filter((c) => c.alerta_contactar);
  document.getElementById('lista-alertas').innerHTML = alertas.map((c) => `
    <div class="tarjeta">
      <div class="fila">
        <div>
          <strong>${c.nombre}</strong><br>
          <span style="color:var(--crema-tenue)">${c.telefono}</span>
        </div>
        <div style="text-align:right;">
          <span class="etiqueta roja">${c.dias_desde_ultima} días sin venir</span><br>
          <span style="color:var(--crema-tenue); font-size:.85rem;">Última visita: ${c.ultima_visita}</span>
        </div>
      </div>
    </div>`).join('') || '<div class="tarjeta">No hay clientes para contactar por ahora.</div>';

  document.getElementById('lista-fidelidad').innerHTML = clientes.map((c) => {
    const puntos = Array.from({ length: 10 }, (_, i) =>
      `<span class="punto ${i < c.cortes_acumulados ? 'lleno' : ''}"></span>`).join('');
    return `<div class="tarjeta acento-fidelidad">
      <div class="fila">
        <div><strong>${c.nombre}</strong> <span style="color:var(--crema-tenue)">${c.telefono}</span></div>
        <div style="color:var(--crema-tenue)">${c.faltan_para_gratis === 0 ? '¡Próximo corte gratis!' : `Faltan ${c.faltan_para_gratis} para el gratis`}</div>
      </div>
      <div class="puntos-fidelidad">${puntos}</div>
    </div>`;
  }).join('') || '<div class="tarjeta">Aún no hay clientes registrados.</div>';
}

// ---------- Calendario semanal ----------
let offsetSemana = 0; // 0 = semana actual, -1 = anterior, +1 = siguiente

function inicioDeSemana(fecha) {
  const d = new Date(fecha);
  const diaSemana = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - diaSemana);
  d.setHours(0, 0, 0, 0);
  return d;
}
function aTextoFecha(d) { return d.toISOString().split('T')[0]; }

async function cargarCalendario() {
  const hoy = new Date();
  const lunes = inicioDeSemana(hoy);
  lunes.setDate(lunes.getDate() + offsetSemana * 7);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return d;
  });

  const fechaInicio = aTextoFecha(dias[0]);
  const fechaFin = aTextoFecha(dias[6]);
  document.getElementById('etiqueta-semana').textContent =
    `${dias[0].toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} — ${dias[6].toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const res = await fetch(`/api/citas?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`, { headers: cabeceras() });
  const citas = await res.json();

  const nombresDia = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const hoyTexto = aTextoFecha(new Date());

  document.getElementById('calendario-semana').innerHTML = dias.map((d, i) => {
    const fechaTexto = aTextoFecha(d);
    const citasDelDia = citas.filter((c) => c.fecha === fechaTexto).sort((a, b) => a.hora.localeCompare(b.hora));
    const chips = citasDelDia.map((c) => `
      <div class="cita-chip ${c.estado}">
        <span class="hora-chip">${c.hora}</span> — ${c.nombre}<br>
        <span style="color:var(--crema-tenue)">${c.servicio}</span>
      </div>`).join('') || '<div class="sin-citas-dia">Sin citas</div>';

    return `<div class="dia-columna ${fechaTexto === hoyTexto ? 'es-hoy' : ''}">
      <div class="dia-encabezado">
        ${nombresDia[i]}<br><strong>${d.getDate()}/${d.getMonth() + 1}</strong>
      </div>
      ${chips}
    </div>`;
  }).join('');
}

document.getElementById('btn-semana-anterior').addEventListener('click', () => {
  offsetSemana -= 1;
  cargarCalendario();
});
document.getElementById('btn-semana-siguiente').addEventListener('click', () => {
  offsetSemana += 1;
  cargarCalendario();
});

// ---------- Administración de servicios y precios ----------
async function cargarServiciosAdmin() {
  const res = await fetch('/api/admin/servicios', { headers: cabeceras() });
  const servicios = await res.json();

  document.getElementById('lista-servicios').innerHTML = `<div class="tarjeta">` +
    servicios.map((s) => `
      <div class="servicio-fila ${s.activo ? '' : 'inactivo'}" data-id="${s.id}">
        <input type="text" class="campo-nombre" value="${s.nombre}" data-campo="nombre">
        <input type="number" value="${s.precio}" min="0" step="1000" data-campo="precio">
        <input type="number" value="${s.duracion_min}" min="5" step="5" data-campo="duracion_min">
        <button class="secundario btn-guardar-servicio">Guardar</button>
        <button class="${s.activo ? 'secundario' : 'ok'} btn-toggle-servicio">${s.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="peligro btn-borrar-servicio">Eliminar</button>
      </div>`).join('') +
    `</div>` || '<div class="tarjeta">Aún no hay servicios. Agrega el primero arriba.</div>';

  document.querySelectorAll('.btn-guardar-servicio').forEach((btn) => {
    btn.addEventListener('click', (e) => guardarServicio(e.target.closest('.servicio-fila')));
  });
  document.querySelectorAll('.btn-toggle-servicio').forEach((btn) => {
    btn.addEventListener('click', (e) => toggleServicio(e.target.closest('.servicio-fila')));
  });
  document.querySelectorAll('.btn-borrar-servicio').forEach((btn) => {
    btn.addEventListener('click', (e) => borrarServicio(e.target.closest('.servicio-fila')));
  });
}

function datosDeFila(fila) {
  const datos = {};
  fila.querySelectorAll('[data-campo]').forEach((input) => {
    datos[input.dataset.campo] = input.type === 'number' ? Number(input.value) : input.value;
  });
  return datos;
}

async function guardarServicio(fila) {
  await fetch(`/api/admin/servicios/${fila.dataset.id}`, {
    method: 'PUT', headers: cabeceras(), body: JSON.stringify(datosDeFila(fila)),
  });
  cargarServiciosAdmin();
}

async function toggleServicio(fila) {
  const activo = fila.classList.contains('inactivo'); // si está inactivo, lo vamos a activar
  await fetch(`/api/admin/servicios/${fila.dataset.id}`, {
    method: 'PUT', headers: cabeceras(), body: JSON.stringify({ ...datosDeFila(fila), activo }),
  });
  cargarServiciosAdmin();
}

async function borrarServicio(fila) {
  if (!confirm('¿Eliminar este servicio? Las citas ya agendadas con este servicio no se verán afectadas.')) return;
  await fetch(`/api/admin/servicios/${fila.dataset.id}`, { method: 'DELETE', headers: cabeceras() });
  cargarServiciosAdmin();
}

document.getElementById('form-nuevo-servicio').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch('/api/admin/servicios', {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      nombre: document.getElementById('ns-nombre').value,
      precio: Number(document.getElementById('ns-precio').value),
      duracion_min: Number(document.getElementById('ns-duracion').value),
    }),
  });
  e.target.reset();
  cargarServiciosAdmin();
});
