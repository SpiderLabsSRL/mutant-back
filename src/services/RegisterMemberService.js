const { query, pool } = require("../../db");

// ============================================
// CONVENCIÓN DE ESTADOS POR TABLA (verificado en BD)
// ============================================
// personas:      0 = activo, 1 = inactivo
// servicios:     1 = activo, 0 = inactivo, 2 = eliminado
// inscripciones: 1 = activo, 0 = inactivo, 2 = eliminado
// cupones:       1 = activo
// empleados:     1 = activo
const ESTADO = {
  personas: 0,
  servicios: 1,
  inscripciones: 1,
  cupones: 1,
  empleados: 1,
};

// ============================================
// SERVICIOS POR SUCURSAL
// ============================================
exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(
    `
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado, s.multisucursal,
           s.tipo_duracion, s.cantidad_duracion, s.cantidad_personas,
           ts.nombre AS tipo_servicio
    FROM servicios s
    INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
    WHERE ss.sucursal_id = $1 AND s.estado = $2 AND ss.disponible = true
    ORDER BY s.nombre
  `,
    [sucursalId, ESTADO.servicios]
  );

  return result.rows;
};

// ============================================
// BUSCAR PERSONAS
// ============================================
exports.searchPeople = async (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const normalizedSearch = searchTerm.trim().replace(/\s+/g, " ");

  const result = await query(
    `
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas
    WHERE (
      unaccent(LOWER(REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($1))
      OR unaccent(LOWER(REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($1))
      OR TRIM(ci) ILIKE $1
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($1))
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($1))
    )
    AND estado = $2
    ORDER BY apellidos, nombres
    LIMIT 10
  `,
    [`%${normalizedSearch}%`, ESTADO.personas]
  );

  return result.rows;
};

// ============================================
// SUSCRIPCIONES ACTIVAS
// ============================================
exports.getActiveSubscriptions = async (personaId, sucursalId) => {
  const result = await query(
    `
    SELECT i.id, i.servicio_id, i.sucursal_id, i.fecha_inicio, i.fecha_vencimiento, 
           i.ingresos_disponibles, i.estado, s.multisucursal,
           ts.nombre AS tipo_servicio
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
    WHERE i.persona_id = $1 
    AND i.estado = $2
    AND i.fecha_vencimiento > CURRENT_DATE 
    AND (i.sucursal_id = $3 OR s.multisucursal = true)
  `,
    [personaId, ESTADO.inscripciones, sucursalId]
  );

  return result.rows;
};

// ============================================
// ESTADO DE CAJA
// ============================================
exports.getCashRegisterStatus = async (cajaId) => {
  const result = await query(
    `
    SELECT 
      c.id as caja_id,
      c.nombre as nombre_caja,
      COALESCE(c.estado_caja, 'cerrada') as estado,
      COALESCE(c.total, 0) as monto_final,
      (SELECT monto FROM movimientos_caja 
       WHERE caja_id = c.id AND tipo = 'apertura'
       ORDER BY fecha DESC LIMIT 1) as monto_inicial,
      (SELECT usuario_id FROM movimientos_caja
       WHERE caja_id = c.id
       ORDER BY fecha DESC LIMIT 1) as usuario_id
    FROM cajas c
    WHERE c.id = $1
  `,
    [cajaId]
  );

  if (result.rows.length === 0) {
    return { estado: "cerrada", monto_final: 0 };
  }

  return result.rows[0];
};

// ============================================
// VALIDAR CUPÓN
// ============================================
exports.validateCoupon = async (codigo, sucursalId) => {
  if (!codigo || !codigo.trim()) {
    throw new Error("Código de cupón requerido");
  }

  const cuponResult = await query(
    `
    SELECT 
      c.id, c.codigo, c.tipo, c.valor_descuento, c.descripcion,
      c.fecha_inicio, c.fecha_fin, c.usos, c.usos_maximos,
      c.aplica_servicios, c.aplica_productos, c.estado
    FROM cupones c
    WHERE UPPER(c.codigo) = UPPER($1)
  `,
    [codigo.trim()]
  );

  if (cuponResult.rows.length === 0) {
    throw new Error("Cupón no encontrado");
  }

  const cupon = cuponResult.rows[0];

  if (Number(cupon.estado) !== ESTADO.cupones) {
    throw new Error("El cupón no está activo");
  }

  if (!cupon.aplica_servicios) {
    throw new Error("Este cupón solo aplica a productos, no a servicios");
  }

  const sucursalesResult = await query(
    `SELECT sucursal_id FROM cupon_sucursal WHERE cupon_id = $1`,
    [cupon.id]
  );
  const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

  if (sucursalesIds.length > 0 && !sucursalesIds.includes(sucursalId)) {
    throw new Error("El cupón no está disponible en esta sucursal");
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(cupon.fecha_inicio);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(cupon.fecha_fin);
  fin.setHours(23, 59, 59, 999);

  if (hoy < inicio) throw new Error("El cupón aún no está vigente");
  if (hoy > fin) throw new Error("El cupón ha expirado");
  if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
    throw new Error("El cupón ha alcanzado su límite de usos");
  }

  return {
    id: cupon.id,
    codigo: cupon.codigo,
    tipo: cupon.tipo,
    valor: parseFloat(cupon.valor_descuento),
    descripcion: cupon.descripcion || "",
    fechaInicio: cupon.fecha_inicio,
    fechaExpiracion: cupon.fecha_fin,
    usosMaximos: cupon.usos_maximos,
    usosActuales: cupon.usos,
  };
};

// ============================================
// LISTAR CUPONES DISPONIBLES
// ============================================
exports.getAvailableCoupons = async (sucursalId) => {
  const result = await query(
    `
    SELECT 
      c.id, c.codigo, c.tipo, c.valor_descuento, c.descripcion,
      c.fecha_inicio, c.fecha_fin, c.usos, c.usos_maximos
    FROM cupones c
    INNER JOIN cupon_sucursal cs ON c.id = cs.cupon_id
    WHERE cs.sucursal_id = $1
      AND c.estado = $2
      AND c.aplica_servicios = true
      AND CURRENT_DATE BETWEEN c.fecha_inicio AND c.fecha_fin
      AND (c.usos_maximos = 0 OR c.usos < c.usos_maximos)
    ORDER BY c.codigo
  `,
    [sucursalId, ESTADO.cupones]
  );

  return result.rows.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: parseFloat(c.valor_descuento),
    descripcion: c.descripcion || "",
    fechaInicio: c.fecha_inicio,
    fechaExpiracion: c.fecha_fin,
    usosMaximos: c.usos_maximos,
    usosActuales: c.usos,
  }));
};

// ============================================
// REGISTRAR MIEMBRO (MULTI-PERSONA)
// ============================================
exports.registerMember = async (registrationData) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ============================================
    // 1. Resolver personas
    // ============================================
    const personaIds = [];

    for (const p of registrationData.personas) {
      let personaId =
        p.personaId && Number(p.personaId) > 0 ? Number(p.personaId) : null;

      if (!personaId) {
        // Buscar por CI (solo activos)
        const existing = await client.query(
          `SELECT id FROM personas WHERE ci = $1 AND estado = $2`,
          [p.ci, ESTADO.personas]
        );

        if (existing.rows.length > 0) {
          personaId = existing.rows[0].id;
        } else {
          // Crear persona nueva
          const ins = await client.query(
            `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              p.nombres,
              p.apellidos,
              p.ci,
              p.telefono || null,
              p.fechaNacimiento || null,
              ESTADO.personas,
            ]
          );
          personaId = ins.rows[0].id;
        }
      }

      personaIds.push(personaId);
    }

    // ============================================
    // 2. Validar servicios
    // ============================================
    const serviciosInfo = [];
    for (const servicio of registrationData.servicios) {
      const r = await client.query(
        `
        SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal,
               s.tipo_duracion, s.cantidad_duracion, s.cantidad_personas,
               ss.sucursal_id, ss.disponible
        FROM servicios s
        INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
        WHERE s.id = $1 AND ss.sucursal_id = $2 AND ss.disponible = true
      `,
        [servicio.servicioId, registrationData.sucursalId]
      );

      if (r.rows.length === 0) {
        throw new Error(
          `Servicio no disponible en esta sucursal: ${servicio.servicioId}`
        );
      }

      serviciosInfo.push({
        ...servicio,
        ...r.rows[0],
      });
    }

    // ============================================
    // 3. Validar cupón (si viene)
    // ============================================
    let cuponId = null;
    if (registrationData.cupon_codigo) {
      const cuponResult = await client.query(
        `
        SELECT c.id, c.tipo, c.valor_descuento, c.usos, c.usos_maximos,
               c.fecha_inicio, c.fecha_fin, c.aplica_servicios, c.estado
        FROM cupones c
        WHERE UPPER(c.codigo) = UPPER($1)
      `,
        [registrationData.cupon_codigo.trim()]
      );

      if (cuponResult.rows.length === 0) {
        throw new Error("Cupón no encontrado");
      }

      const cupon = cuponResult.rows[0];

      if (Number(cupon.estado) !== ESTADO.cupones) {
        throw new Error("El cupón no está activo");
      }
      if (!cupon.aplica_servicios) {
        throw new Error("El cupón no aplica a servicios");
      }

      const sucursalesResult = await client.query(
        `SELECT sucursal_id FROM cupon_sucursal WHERE cupon_id = $1`,
        [cupon.id]
      );
      const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

      if (
        sucursalesIds.length > 0 &&
        !sucursalesIds.includes(registrationData.sucursalId)
      ) {
        throw new Error("El cupón no está disponible en esta sucursal");
      }

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const inicio = new Date(cupon.fecha_inicio);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(cupon.fecha_fin);
      fin.setHours(23, 59, 59, 999);

      if (hoy < inicio) throw new Error("El cupón aún no está vigente");
      if (hoy > fin) throw new Error("El cupón ha expirado");
      if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
        throw new Error("El cupón ha alcanzado su límite de usos");
      }

      await client.query(`SELECT id FROM cupones WHERE id = $1 FOR UPDATE`, [
        cupon.id,
      ]);

      cuponId = cupon.id;

      await client.query(
        `UPDATE cupones SET usos = usos + 1 WHERE id = $1`,
        [cuponId]
      );
    }

    // ============================================
    // 4. Fecha actual
    // ============================================
    const fechaActualResult = await client.query(
      `SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual`
    );
    const fechaActual = fechaActualResult.rows[0].fecha_actual;

    // ============================================
    // 5. Resolver personaIndexes → personaIds
    // ============================================
    const resolvePersonaIds = (servicio) => {
      if (
        !servicio.personaIndexes ||
        servicio.personaIndexes.length === 0
      ) {
        return [...personaIds];
      }
      return servicio.personaIndexes
        .map((idx) => personaIds[idx])
        .filter((id) => id !== undefined && id !== null);
    };

    // ============================================
    // 6. Crear inscripciones
    // ============================================
    const inscripcionesMap = {};

    for (const servicio of serviciosInfo) {
      const realPersonaIds = resolvePersonaIds(servicio);

      if (realPersonaIds.length === 0) {
        console.warn(
          `⚠️ Servicio ${servicio.servicioId} sin personas asignadas`
        );
        continue;
      }

      for (const personaId of realPersonaIds) {
        console.log(
          `📝 Creando inscripción: servicio=${servicio.servicioId}, persona=${personaId}, sucursal=${registrationData.sucursalId}, inicio=${servicio.fechaInicio}, fin=${servicio.fechaVencimiento}`
        );

        const ins = await client.query(
          `
          INSERT INTO inscripciones
            (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
          [
            personaId,
            servicio.servicioId,
            registrationData.sucursalId,
            servicio.fechaInicio,
            servicio.fechaVencimiento,
            servicio.numero_ingresos,
            ESTADO.inscripciones,
          ]
        );

        console.log(`✅ Inscripción creada con id=${ins.rows[0].id}`);

        inscripcionesMap[`${servicio.servicioId}:${personaId}`] =
          ins.rows[0].id;

        if (servicio.multisucursal) {
          const otras = await client.query(
            `
            SELECT sucursal_id 
            FROM servicio_sucursal 
            WHERE servicio_id = $1 AND sucursal_id != $2 AND disponible = true
          `,
            [servicio.servicioId, registrationData.sucursalId]
          );

          for (const otra of otras.rows) {
            await client.query(
              `
              INSERT INTO inscripciones
                (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
              [
                personaId,
                servicio.servicioId,
                otra.sucursal_id,
                servicio.fechaInicio,
                servicio.fechaVencimiento,
                servicio.numero_ingresos,
                ESTADO.inscripciones,
              ]
            );
          }
        }
      }
    }

    // ============================================
    // 7. Detalle de pago
    // ============================================
    let detallePago = null;
    if (registrationData.formaPago === "efectivo") {
      detallePago = "Pago completo en efectivo";
    } else if (registrationData.formaPago === "qr") {
      detallePago = "Pago completo con QR";
    } else if (registrationData.formaPago === "mixto") {
      detallePago = `Efectivo: ${registrationData.montoEfectivo}, QR: ${registrationData.montoQr}`;
    }

    if (registrationData.pagoPlazos) {
      detallePago += ` | Pago en plazos - Entregado: ${registrationData.montoEntregado}, Pendiente: ${registrationData.montoPendiente}`;
    }

    // ============================================
    // 8. Subtotal
    // ============================================
    const subtotal = serviciosInfo.reduce((sum, s) => {
      const n =
        s.personaIndexes && s.personaIndexes.length > 0
          ? s.personaIndexes.length
          : personaIds.length;
      return sum + Number(s.precio) * n;
    }, 0);

    // ============================================
    // 9. Crear venta
    // ============================================
    const ventaResult = await client.query(
      `
      INSERT INTO ventas_servicios (
        persona_id, empleado_id, subtotal, descuento, descripcion_descuento, 
        total, forma_pago, detalle_pago, sucursal_id, caja_id, cupon_id, fecha
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TIMEZONE('America/La_Paz', NOW()))
      RETURNING id
    `,
      [
        personaIds[0],
        registrationData.empleadoId,
        subtotal,
        registrationData.descuento,
        registrationData.descripcionDescuento,
        registrationData.total,
        registrationData.formaPago,
        detallePago,
        registrationData.sucursalId,
        registrationData.cajaId,
        cuponId,
      ]
    );

    const ventaId = ventaResult.rows[0].id;

    // ============================================
    // 10. Detalles
    // ============================================
    for (const servicio of serviciosInfo) {
      const realPersonaIds = resolvePersonaIds(servicio);

      for (const personaId of realPersonaIds) {
        const inscripcionId =
          inscripcionesMap[`${servicio.servicioId}:${personaId}`];
        if (!inscripcionId) continue;

        await client.query(
          `
          INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
          VALUES ($1, $2, $3)
        `,
          [ventaId, inscripcionId, servicio.precio]
        );
      }
    }

    // ============================================
    // 11. Pagos pendientes
    // ============================================
    const pagosPendientesIds = [];
    if (registrationData.pagoPlazos && registrationData.montoPendiente > 0) {
      const n = personaIds.length;
      const pendientePorPersona = registrationData.montoPendiente / n;
      const entregadoPorPersona = registrationData.montoEntregado / n;
      const totalPorPersona = registrationData.total / n;

      for (const personaId of personaIds) {
        const pp = await client.query(
          `
          INSERT INTO pagos_pendientes (
            persona_id, venta_servicio_id, monto_total, monto_pagado, monto_pendiente,
            fecha_inscripcion, fecha_ultima_actualizacion, estado
          )
          VALUES ($1, $2, $3, $4, $5, $6, $6, 'pendiente')
          RETURNING id
        `,
          [
            personaId,
            ventaId,
            totalPorPersona,
            entregadoPorPersona,
            pendientePorPersona,
            fechaActual,
          ]
        );
        pagosPendientesIds.push(pp.rows[0].id);
      }
    }

    // ============================================
    // 12. Movimiento de caja (efectivo)
    // ============================================
    const hayEfectivo =
      registrationData.formaPago === "efectivo" ||
      registrationData.formaPago === "mixto";

    if (hayEfectivo) {
      const montoEfectivo =
        registrationData.formaPago === "efectivo"
          ? registrationData.total
          : registrationData.montoEfectivo || 0;

      if (montoEfectivo > 0) {
        const cajaResult = await client.query(
          `SELECT estado_caja, COALESCE(total, 0) as total_actual 
           FROM cajas 
           WHERE id = $1 
           FOR UPDATE`,
          [registrationData.cajaId]
        );

        if (cajaResult.rows.length === 0) {
          throw new Error("Caja no encontrada");
        }

        const cajaActual = cajaResult.rows[0];

        if (cajaActual.estado_caja !== "abierta") {
          throw new Error(
            "La caja no está abierta para realizar inscripciones"
          );
        }

        const montoAnterior = parseFloat(cajaActual.total_actual);
        const montoActual = montoAnterior + montoEfectivo;

        const usuarioResult = await client.query(
          `SELECT id as usuario_id FROM usuarios WHERE empleado_id = $1`,
          [registrationData.empleadoId]
        );

        if (usuarioResult.rows.length === 0) {
          throw new Error(
            `No se encontró un usuario asociado al empleado ${registrationData.empleadoId}`
          );
        }

        const usuarioId = usuarioResult.rows[0].usuario_id;

        await client.query(
          `
          INSERT INTO movimientos_caja 
            (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual,
             venta_servicio_id, fecha)
          VALUES ($1, $2, $3, 'ingreso', $4, $5, $6, $7, TIMEZONE('America/La_Paz', NOW()))
        `,
          [
            registrationData.cajaId,
            usuarioId,
            montoEfectivo,
            `Venta #${ventaId} - Servicios (Efectivo)`,
            montoAnterior,
            montoActual,
            ventaId,
          ]
        );

        await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
          montoActual,
          registrationData.cajaId,
        ]);
      }
    }

    // ============================================
    // 13. Movimiento de caja QR
    // ============================================
    const montoQr =
      registrationData.formaPago === "qr"
        ? registrationData.total
        : registrationData.formaPago === "mixto"
        ? registrationData.montoQr || 0
        : 0;

    if (montoQr > 0) {
      const usuarioResult = await client.query(
        `SELECT id as usuario_id FROM usuarios WHERE empleado_id = $1`,
        [registrationData.empleadoId]
      );

      if (usuarioResult.rows.length > 0) {
        const usuarioId = usuarioResult.rows[0].usuario_id;

        const totalActual = await client.query(
          `SELECT COALESCE(total, 0) as total_actual FROM cajas WHERE id = $1`,
          [registrationData.cajaId]
        );

        const montoActual = parseFloat(totalActual.rows[0].total_actual);

        await client.query(
          `
          INSERT INTO movimientos_caja 
            (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual,
             venta_servicio_id, fecha)
          VALUES ($1, $2, $3, 'ingreso', $4, $5, $5, $6, TIMEZONE('America/La_Paz', NOW()))
        `,
          [
            registrationData.cajaId,
            usuarioId,
            montoQr,
            `Venta #${ventaId} - Servicios (QR - no afecta caja física)`,
            montoActual,
            ventaId,
          ]
        );
      }
    }

    await client.query("COMMIT");

    return {
      success: true,
      ventaId: ventaId,
      pagoPendienteIds: pagosPendientesIds,
      message: registrationData.pagoPlazos
        ? "Inscripción registrada correctamente con pago en plazos"
        : "Inscripción registrada correctamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in registerMember service:", error);
    console.error("❌ Detalles:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      where: error.where,
    });
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// PAGOS PENDIENTES
// ============================================
exports.getPagosPendientes = async (personaId) => {
  const result = await query(
    `
    SELECT 
      pp.id,
      pp.persona_id as "personaId",
      pp.venta_servicio_id as "ventaServicioId",
      pp.monto_total as "montoTotal",
      pp.monto_pagado as "montoPagado",
      pp.monto_pendiente as "montoPendiente",
      pp.fecha_inscripcion as "fechaInscripcion",
      pp.fecha_ultima_actualizacion as "fechaUltimaActualizacion",
      pp.estado
    FROM pagos_pendientes pp
    WHERE pp.persona_id = $1 AND pp.estado = 'pendiente'
    ORDER BY pp.fecha_inscripcion DESC
  `,
    [personaId]
  );

  return result.rows;
};

exports.updatePagoPendiente = async (pagoId, montoPagado) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pagoActual = await client.query(
      `
      SELECT monto_pagado, monto_pendiente, monto_total
      FROM pagos_pendientes
      WHERE id = $1 AND estado = 'pendiente'
    `,
      [pagoId]
    );

    if (pagoActual.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado");
    }

    const { monto_pagado, monto_pendiente } = pagoActual.rows[0];

    const nuevoMontoPagado = parseFloat(monto_pagado) + parseFloat(montoPagado);
    const nuevoMontoPendiente =
      parseFloat(monto_pendiente) - parseFloat(montoPagado);

    if (nuevoMontoPendiente < 0) {
      throw new Error("El monto pagado no puede ser mayor al monto pendiente");
    }

    const fechaActualResult = await client.query(
      `SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual`
    );
    const fechaActual = fechaActualResult.rows[0].fecha_actual;

    await client.query(
      `
      UPDATE pagos_pendientes 
      SET 
        monto_pagado = $1,
        monto_pendiente = $2,
        fecha_ultima_actualizacion = $3,
        estado = CASE WHEN $2 = 0 THEN 'completado' ELSE 'pendiente' END
      WHERE id = $4
    `,
      [nuevoMontoPagado, nuevoMontoPendiente, fechaActual, pagoId]
    );

    await client.query("COMMIT");

    return {
      success: true,
      message:
        nuevoMontoPendiente === 0
          ? "Pago completado exitosamente"
          : "Pago actualizado exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating pending payment:", error);
    throw error;
  } finally {
    client.release();
  }
};