const selectServicio = document.getElementById('servicio');
const form = document.getElementById('form-cita');
const resultado = document.getElementById('resultado');
const inputFecha = document.getElementById('fecha');

// No permitir agendar en fechas pasadas
inputFecha.min = new Date().toISOString().split('T')[0];

async function cargarServicios() {
  const res = await fetch('/api/servicios');
  const servicios = await res.json();
  selectServicio.innerHTML = servicios
    .map(s => `<option value="${s.nombre}">${s.nombre} — $${Number(s.precio).toLocaleString('es-CO')} (${s.duracion_min} min)</option>`)
    .join('');
}
cargarServicios();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultado.innerHTML = '';
  const datos = Object.fromEntries(new FormData(form).entries());
  const boton = form.querySelector('button');
  boton.disabled = true;

  try {
    const res = await fetch('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const data = await res.json();

    if (!res.ok) {
      resultado.innerHTML = `<div class="aviso error">${data.error || 'No se pudo agendar la cita.'}</div>`;
    } else {
      let extra = '';
      if (data.faltan_para_gratis === 0) {
        extra = ' Además, con este corte completarías tu corte GRATIS 🎉';
      } else {
        extra = ` Te faltan ${data.faltan_para_gratis} cortes para tu corte gratis.`;
      }
      resultado.innerHTML = `<div class="aviso exito">${data.mensaje}${extra}</div>`;
      form.reset();
      inputFecha.min = new Date().toISOString().split('T')[0];
    }
  } catch (err) {
    resultado.innerHTML = `<div class="aviso error">Error de conexión. Intenta de nuevo.</div>`;
  } finally {
    boton.disabled = false;
  }
});
