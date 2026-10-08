require("dotenv").config();
const { actualizarEstadosInscripciones } = require("./src/jobs/updateInscripcionesEstados");

actualizarEstadosInscripciones()
  .then((r) => {
    console.log("✅ Listo:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  });