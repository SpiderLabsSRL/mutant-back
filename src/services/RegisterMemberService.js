const { query, pool } = require("../../db");

// ============================================
// SERVICIOS POR SUCURSAL
// ============================================
exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(
    `
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado, s.multisucursal,
           s.tipo_duracion, s.cantidad_duracion
    FROM servicios s
    INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    WHERE ss.sucursal_id = $1 AND s.estado = 1 AND ss.disponible = true
    ORDER BY s.nombre
  `,
    [sucursalId]
  );

  return result.rows;
};

// ============================================
// BUSCAR PERSONAS
// ============================================
exports.searchPeople = async (searchTerm) => {
  const result = await query(
    `
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas
    WHERE (nombres ILIKE $1 OR apellidos ILIKE $1 OR ci ILIKE $1)
    AND estado = 0
    ORDER BY apellidos, nombres
    LIMIT 10
  `,
    [`%${searchTerm}%`]
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
           i.ingresos_disponibles, i.estado, s.multisucursal
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    WHERE i.persona_id = $1 
    AND i.estado = 1 
    AND i.fecha_vencimiento > CURRENT_DATE 
    AND (i.sucursal_id = $2 OR s.multisucursal = true)
  `,
    [personaId, sucursalId]
  );

  return result.rows;
};

// ============================================
// ESTADO DE CAJA (nueva estructura)
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

  // 1. Buscar cupón
  const cuponResult = await query(
    `
    SELECT 
      c.id,
      c.codigo,
      c.tipo,
      c.valor_descuento,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.usos,
      c.usos_maximos,
      c.aplica_servicios,
      c.aplica_productos,
      c.estado
    FROM cupones c
    WHERE UPPER(c.codigo) = UPPER($1)
  `,
    [codigo.trim()]
  );

  if (cuponResult.rows.length === 0) {
    throw new Error("Cupón no encontrado");
  }

  const cupon = cuponResult.rows[0];

  // 2. Validar estado
  if (cupon.estado !== 1) {
    throw new Error("El cupón no está activo");
  }

  // 3. Validar que aplique a servicios
  if (!cupon.aplica_servicios) {
    throw new Error("Este cupón solo aplica a productos, no a servicios");
  }

  // 4. Validar sucursales
  const sucursalesResult = await query(
    `SELECT sucursal_id FROM cupon_sucursal WHERE cupon_id = $1`,
    [cupon.id]
  );
  const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

  if (sucursalesIds.length > 0 && !sucursalesIds.includes(sucursalId)) {
    throw new Error("El cupón no está disponible en esta sucursal");
  }

  // 5. Validar fechas
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(cupon.fecha_inicio);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(cupon.fecha_fin);
  fin.setHours(23, 59, 59, 999);

  if (hoy < inicio) {
    throw new Error("El cupón aún no está vigente");
  }

  if (hoy > fin) {
    throw new Error("El cupón ha expirado");
  }

  // 6. Validar usos
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
      c.id,
      c.codigo,
      c.tipo,
      c.valor_descuento,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.usos,
      c.usos_maximos
    FROM cupones c
    INNER JOIN cupon_sucursal cs ON c.id = cs.cupon_id
    WHERE cs.sucursal_id = $1
      AND c.estado = 1
      AND c.aplica_servicios = true
      AND CURRENT_DATE BETWEEN c.fecha_inicio AND c.fecha_fin
      AND (c.usos_maximos = 0 OR c.usos < c.usos_maximos)
    ORDER BY c.codigo
  `,
    [sucursalId]
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
// HELPERS
// ============================================
const checkExistingPerson = async (client, ci) => {
  const existingPerson = await client.query(
    `
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas 
    WHERE ci = $1 AND estado = 0
  `,
    [ci]
  );

  return existingPerson.rows[0] || null;
};

// ============================================
// REGISTRAR MIEMBRO (nueva estructura + cupones)
// ============================================
exports.registerMember = async (registrationData) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ============================================
    // 1. Crear o validar persona
    // ============================================
    let personaId = registrationData.personaId;

    if (!personaId) {
      const { ci } = registrationData;

      const existingPerson = await checkExistingPerson(client, ci);
      if (existingPerson) {
        const error = new Error("La persona ya existe");
        error.existingPerson = existingPerson;
        throw error;
      }

      const personaResult = await client.query(
        `
        INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
        VALUES ($1, $2, $3, $4, $5, 0)
        RETURNING id
      `,
        [
          registrationData.nombres,
          registrationData.apellidos,
          registrationData.ci,
          registrationData.telefono,
          registrationData.fechaNacimiento,
        ]
      );

      personaId = personaResult.rows[0].id;
    }

    // ============================================
    // 2. Validar servicios
    // ============================================
    const serviciosInfo = [];
    for (const servicio of registrationData.servicios) {
      const servicioResult = await client.query(
        `
        SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal,
               s.tipo_duracion, s.cantidad_duracion,
               ss.sucursal_id, ss.disponible
        FROM servicios s
        INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
        WHERE s.id = $1 AND ss.sucursal_id = $2
      `,
        [servicio.servicioId, registrationData.sucursalId]
      );

      if (servicioResult.rows.length === 0) {
        throw new Error(
          `Servicio no disponible en esta sucursal: ${servicio.servicioId}`
        );
      }

      serviciosInfo.push({
        ...servicio,
        ...servicioResult.rows[0],
      });
    }

    // ============================================
    // 3. Validar cupón (si viene)
    // ============================================
    let cuponId = null;
    if (registrationData.cupon_codigo) {
      const cuponResult = await client.query(
        `
        SELECT 
          c.id,
          c.tipo,
          c.valor_descuento,
          c.usos,
          c.usos_maximos,
          c.fecha_inicio,
          c.fecha_fin,
          c.aplica_servicios,
          c.estado
        FROM cupones c
        WHERE UPPER(c.codigo) = UPPER($1)
      `,
        [registrationData.cupon_codigo.trim()]
      );

      if (cuponResult.rows.length === 0) {
        throw new Error("Cupón no encontrado");
      }

      const cupon = cuponResult.rows[0];

      if (cupon.estado !== 1) {
        throw new Error("El cupón no está activo");
      }

      if (!cupon.aplica_servicios) {
        throw new Error("El cupón no aplica a servicios");
      }

      // Validar sucursal
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

      // Validar fechas
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const inicio = new Date(cupon.fecha_inicio);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(cupon.fecha_fin);
      fin.setHours(23, 59, 59, 999);

      if (hoy < inicio) {
        throw new Error("El cupón aún no está vigente");
      }

      if (hoy > fin) {
        throw new Error("El cupón ha expirado");
      }

      if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
        throw new Error("El cupón ha alcanzado su límite de usos");
      }

      // Bloquear la fila
      await client.query(`SELECT id FROM cupones WHERE id = $1 FOR UPDATE`, [
        cupon.id,
      ]);

      cuponId = cupon.id;

      // Registrar uso
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
    // 5. Crear inscripciones
    // ============================================
    const inscripcionesIds = [];
    for (const servicio of serviciosInfo) {
      const inscripcionResult = await client.query(
        `
        INSERT INTO inscripciones (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        RETURNING id
      `,
        [
          personaId,
          servicio.servicioId,
          registrationData.sucursalId,
          servicio.fechaInicio,
          servicio.fechaVencimiento,
          servicio.numero_ingresos,
        ]
      );

      const inscripcionId = inscripcionResult.rows[0].id;

      // Si es multisucursal, crear inscripciones en otras sucursales
      if (servicio.multisucursal) {
        const otrasSucursales = await client.query(
          `
          SELECT sucursal_id 
          FROM servicio_sucursal 
          WHERE servicio_id = $1 AND sucursal_id != $2 AND disponible = true
        `,
          [servicio.servicioId, registrationData.sucursalId]
        );

        for (const otraSucursal of otrasSucursales.rows) {
          await client.query(
            `
            INSERT INTO inscripciones (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
            VALUES ($1, $2, $3, $4, $5, $6, 1)
          `,
            [
              personaId,
              servicio.servicioId,
              otraSucursal.sucursal_id,
              servicio.fechaInicio,
              servicio.fechaVencimiento,
              servicio.numero_ingresos,
            ]
          );
        }
      }

      inscripcionesIds.push(inscripcionId);
    }

    // ============================================
    // 6. Construir detalle_pago
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
    // 7. Crear venta_servicio (con cupon_id)
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
        personaId,
        registrationData.empleadoId,
        registrationData.servicios.reduce((sum, s) => sum + s.precio, 0),
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
    // 8. Detalles de venta
    // ============================================
    for (let i = 0; i < registrationData.servicios.length; i++) {
      await client.query(
        `
        INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
        VALUES ($1, $2, $3)
      `,
        [ventaId, inscripcionesIds[i], registrationData.servicios[i].precio]
      );
    }

    // ============================================
    // 9. Pago pendiente (si aplica)
    // ============================================
    let pagoPendienteId = null;
    if (registrationData.pagoPlazos && registrationData.montoPendiente > 0) {
      const pagoPendienteResult = await client.query(
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
          registrationData.servicios.reduce((sum, s) => sum + s.precio, 0) -
            registrationData.descuento,
          registrationData.montoEntregado,
          registrationData.montoPendiente,
          fechaActual,
        ]
      );

      pagoPendienteId = pagoPendienteResult.rows[0].id;
    }

    // ============================================
    // 10. Registrar movimiento de caja (nueva estructura)
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
        // Verificar que la caja esté abierta
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

        // Obtener usuario_id del empleado
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

        // Insertar movimiento de caja vinculado a la venta
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

        // Actualizar total de la caja
        await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
          montoActual,
          registrationData.cajaId,
        ]);
      }
    }

    // ============================================
    // 11. Registrar movimiento de caja por QR (informativo)
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
      pagoPendienteId: pagoPendienteId,
      message: registrationData.pagoPlazos
        ? "Inscripción registrada correctamente con pago en plazos"
        : "Inscripción registrada correctamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in registerMember service:", error);
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

    const { monto_pagado, monto_pendiente, monto_total } = pagoActual.rows[0];

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