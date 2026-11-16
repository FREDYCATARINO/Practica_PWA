// Ejemplo de guardado y lectura encadenada con .then() y .catch()
const nuevaOrden = {
  cliente: "Empresa Logística SA",
  monto: 14500,
  fecha: Date.now(),
};

guardarRegistro(nuevaOrden)
  .then((idAsignado) => {
    console.log(
      "Registro encolado localmente con ID:",
      idAsignado,
    );
    return obtenerTodosLosRegistros();
  })
  .then((listaCompleta) => {
    console.table(listaCompleta);
  })
  .catch((error) => {
    console.error(
      "Falla en operación de IndexedDB:",
      error,
    );
  });

function procesarEnvioReporte(datosFormulario) {
  const endpoint =
    "https://jsonplaceholder.typicode.com/posts";

  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datosFormulario),
  })
    .then((respuesta) => {
      if (!respuesta.ok)
        throw new Error("Error HTTP del servidor");
      return respuesta.json();
    })
    .then(() => {
      // Envío exitoso en vivo: registrar en bitácora local como sincronizado
      return guardarRegistro({
        ...datosFormulario,
        estado: "sincronizado",
        fechaCreacion: Date.now(),
      });
    })
    .catch(() => {
      console.warn(
        "[Outbox] Sin conexión. Encolando transacción localmente...",
      );
      // Falla de red: guardar en IndexedDB como pendiente para reenvío posterior
      return guardarRegistro({
        ...datosFormulario,
        estado: "pendiente",
        fechaCreacion: Date.now(),
      });
    })
    .then(() => {
      // Actualizar la lista visual en ambos escenarios
      return renderizarColaOutbox();
    });
}

function sincronizarPendientes() {
  console.log(
    "[Outbox] Conexión detectada. Buscando registros pendientes...",
  );

  return obtenerTodosLosRegistros()
    .then((registros) => {
      const pendientes = registros.filter(
        (item) => item.estado === "pendiente",
      );

      if (pendientes.length === 0) {
        console.log(
          "[Outbox] No hay transacciones pendientes por sincronizar.",
        );
        return;
      }

      // Convertir cada registro pendiente en una promesa de envío + actualización
      const promesasDeEnvio = pendientes.map((item) => {
        return fetch(
          "https://jsonplaceholder.typicode.com/posts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.titulo,
              body: item.descripcion,
            }),
          },
        ).then((res) => {
          if (!res.ok)
            throw new Error("Falla al reintentar envío");
          // Actualizar estado en IndexedDB de 'pendiente' a 'sincronizado'
          return actualizarEstadoRegistro(
            item.id,
            "sincronizado",
          );
        });
      });

      // Esperar a que todos los reenvíos concluyan
      return Promise.all(promesasDeEnvio);
    })
    .then(() => {
      return renderizarColaOutbox();
    })
    .catch((error) => {
      console.error(
        "[Outbox] Error durante la sincronización masiva:",
        error,
      );
    });
}

function renderizarColaOutbox() {
  const ul = document.getElementById("lista-outbox");
  ul.innerHTML = "<li>Cargando registros...</li>";
  return obtenerTodosLosRegistros().then((registros) => {
    ul.innerHTML = "";
    if (registros.length === 0) {
      ul.innerHTML =
        "<li>No hay registros en la cola.</li>";
      return;
    }
    registros.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.cliente} - $${
        item.monto
      } - ${new Date(item.fecha).toLocaleString()}`;
      ul.appendChild(li);
    });
  });
}

renderizarColaOutbox().catch((error) => {
  console.error(
    "Falla al renderizar la cola de outbox:",
    error,
  );
});

function purgarColaOutbox() {
  console.log(
    "[Outbox] Purga de registros sincronizados iniciada...",
  );
  const list = obtenerTodosLosRegistros().then(
    (registros) => {
      console.log(
        "Registros actuales antes de purgar:",
        registros,
      );
    },
  );
  const lista = obtenerTodosLosRegistros().then(
    (registros) => {
      const ids = registros
        .filter((item) => item.estado === "sincronizado")
        .map((item) => item.id);
      return Promise.all(
        ids.map((id) => eliminarRegistro(id)),
      ).then(renderizarColaOutbox);
    },
  );
}

function onSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById("btn-enviar");

  btn.textContent = "Enviando...";

  const title = e.target["titulo"].value;
  const body = e.target["descripcion"].value;
  procesarEnvioReporte({ title, body }).then(() => {
    e.target.reset();
    btn.textContent = "Enviar Reporte";
    renderizarColaOutbox();
  });
}

function actualizarIndicadorRed(isOffline = true) {
  const indicador =
    document.getElementById("indicador-red");
  if (isOffline) {
    indicador.textContent = "Sin conexión";
    indicador.classList.add("offline");
  } else {
    indicador.textContent = "Conectado";
    indicador.classList.remove("offline");
  }
}

// Escuchar el regreso de la conectividad
window.addEventListener("online", () => {
  actualizarIndicadorRed(false);
  sincronizarPendientes();
});

//window.addEventListener("offline", actualizarIndicadorRed);

window.addEventListener("load", () => {
  document
    .getElementById("btn-purgar")
    .addEventListener("click", purgarColaOutbox);
  document
    .getElementById("form-incidencia")
    .addEventListener("submit", (e) => onSubmit(e));
});
