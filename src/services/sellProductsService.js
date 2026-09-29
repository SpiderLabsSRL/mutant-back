// src/services/sellProductsService.js
const { query, pool } = require("../../db");

// ============================================
// GET PRODUCTS
// ============================================
const getProducts = async (userId) => {
  try {
    const userQuery = `
      SELECT 
        e.sucursal_id,
        e.id as empleado_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      WHERE u.id = $1
    `;

    const userResult = await query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }

    const { sucursal_id } = userResult.rows[0];

    const productsQuery = `
      SELECT 
        p.id as idproducto,
        p.nombre,
        p.precio_venta,
        p.codigo,
        p.imagen,
        ps.stock,
        ps.stock_minimo,
        CASE WHEN ps.stock IS NULL THEN true ELSE false END as sin_stock
      FROM producto_sucursal ps
      JOIN productos p ON ps.producto_id = p.id
      WHERE ps.sucursal_id = $1 AND p.estado = 1
      ORDER BY p.nombre
    `;

    const productsResult = await query(productsQuery, [sucursal_id]);

    const products = productsResult.rows.map((product) => {
      const stockValue = product.sin_stock ? 9999 : product.stock || 0;

      let imagenDataUrl = null;
      if (product.imagen) {
        if (Buffer.isBuffer(product.imagen)) {
          imagenDataUrl = `data:image/png;base64,${product.imagen.toString(
            "base64"
          )}`;
        } else if (typeof product.imagen === "string") {
          imagenDataUrl = product.imagen;
        }
      }

      return {
        idproducto: product.idproducto,
        nombre: product.nombre,
        precio_venta: product.precio_venta,
        stock: stockValue,
        sin_stock: product.sin_stock,
        codigo_barras: product.codigo || null,
        imagen: imagenDataUrl,
      };
    });

    return products;
  } catch (error) {
    console.error("Error en getProducts service:", error);
    throw new Error("Error al obtener los productos");
  }
};

// ============================================
// GET CASH REGISTER STATUS
// ============================================
const getCashRegisterStatus = async (userId) => {
  try {
    const userQuery = `
      SELECT 
        e.sucursal_id,
        ec.caja_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      WHERE u.id = $1
      LIMIT 1
    `;

    const userResult = await query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }

    const { caja_id } = userResult.rows[0];

    if (!caja_id) {
      throw new Error("No hay caja activa para esta sucursal");
    }

    const cajaQuery = `
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
    `;

    const cajaResult = await query(cajaQuery, [caja_id]);

    if (cajaResult.rows.length === 0) {
      return {
        estado: "cerrada",
        caja_id: caja_id,
        mensaje: "No se encontró la caja",
      };
    }

    const caja = cajaResult.rows[0];

    return {
      estado_caja_id: null,
      caja_id: caja.caja_id,
      estado: caja.estado,
      monto_inicial: parseFloat(caja.monto_inicial) || 0,
      monto_final: parseFloat(caja.monto_final) || 0,
      usuario_id: caja.usuario_id,
      nombre_caja: caja.nombre_caja,
    };
  } catch (error) {
    console.error("Error en getCashRegisterStatus service:", error);
    throw new Error(error.message || "Error al obtener el estado de la caja");
  }
};

// ============================================
// VALIDATE COUPON (endpoint dedicado)
// ============================================
const validateCoupon = async (userId, codigo) => {
  try {
    if (!codigo || !codigo.trim()) {
      throw new Error("Código de cupón requerido");
    }

    // 1. Obtener sucursal del empleado
    const userQuery = `
      SELECT e.sucursal_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      WHERE u.id = $1
    `;

    const userResult = await query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado");
    }

    const { sucursal_id } = userResult.rows[0];

    // 2. Obtener cupón
    const cuponQuery = `
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
    `;

    const cuponResult = await query(cuponQuery, [codigo.trim()]);

    if (cuponResult.rows.length === 0) {
      throw new Error("Cupón no encontrado");
    }

    const cupon = cuponResult.rows[0];

    // 3. Validaciones
    if (cupon.estado !== 1) {
      throw new Error("El cupón no está activo");
    }

    if (!cupon.aplica_productos) {
      throw new Error("Este cupón solo aplica a servicios, no a productos");
    }

    // 4. Validar sucursales
    const sucursalesQuery = `
      SELECT sucursal_id
      FROM cupon_sucursal
      WHERE cupon_id = $1
    `;

    const sucursalesResult = await query(sucursalesQuery, [cupon.id]);
    const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

    if (
      sucursalesIds.length > 0 &&
      !sucursalesIds.includes(sucursal_id)
    ) {
      throw new Error(
        "El cupón no está disponible en esta sucursal"
      );
    }

    // 5. Validar vigencia
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
      id: cupon.id.toString(),
      codigo: cupon.codigo,
      tipo: cupon.tipo,
      valor: parseFloat(cupon.valor_descuento),
      descripcion: cupon.descripcion || "",
      fechaInicio: cupon.fecha_inicio,
      fechaExpiracion: cupon.fecha_fin,
      usosMaximos: cupon.usos_maximos,
      usosActuales: cupon.usos,
      aplicableA: [
        ...(cupon.aplica_servicios ? ["servicios"] : []),
        ...(cupon.aplica_productos ? ["productos"] : []),
      ],
    };
  } catch (error) {
    console.error("Error en validateCoupon:", error);
    throw error;
  }
};

// ============================================
// PROCESS SALE
// ============================================
const processSale = async (userId, saleData) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Obtener empleado, sucursal y caja
    const userQuery = `
      SELECT 
        e.id as empleado_id,
        e.sucursal_id,
        ec.caja_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      WHERE u.id = $1
      LIMIT 1
    `;

    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }

    const { empleado_id, sucursal_id, caja_id } = userResult.rows[0];

    if (!caja_id) {
      throw new Error("No hay caja activa para esta sucursal");
    }

    // 2. Verificar caja abierta
    const cajaQuery = `
      SELECT estado_caja, COALESCE(total, 0) as total_actual
      FROM cajas 
      WHERE id = $1 
      FOR UPDATE
    `;

    const cajaResult = await client.query(cajaQuery, [caja_id]);

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    const cajaActual = cajaResult.rows[0];

    if (cajaActual.estado_caja !== "abierta") {
      throw new Error("La caja no está abierta para realizar ventas");
    }

    const montoAnteriorCaja = parseFloat(cajaActual.total_actual);

    // 3. Validar stock
    for (const producto of saleData.productos) {
      const productQuery = `
        SELECT 
          p.nombre,
          ps.stock,
          ps.stock IS NULL as sin_stock
        FROM producto_sucursal ps
        JOIN productos p ON ps.producto_id = p.id
        WHERE ps.producto_id = $1 AND ps.sucursal_id = $2
      `;

      const productResult = await client.query(productQuery, [
        producto.producto_id,
        sucursal_id,
      ]);

      if (productResult.rows.length === 0) {
        throw new Error("Producto no encontrado en la sucursal");
      }

      const productInfo = productResult.rows[0];

      if (!productInfo.sin_stock) {
        const currentStock = productInfo.stock || 0;
        if (currentStock < producto.cantidad) {
          throw new Error(
            `Stock insuficiente para ${productInfo.nombre}. Disponible: ${currentStock}, Solicitado: ${producto.cantidad}`
          );
        }
      }
    }

    // ============================================
    // 4. Validar cupón (SEPARADO: primero GROUP BY, luego FOR UPDATE)
    // ============================================
    let cuponId = null;
    if (saleData.cupon_codigo) {
      // 4.1 Primero obtener el cupón SIN FOR UPDATE (para poder agrupar)
      const cuponQuery = `
        SELECT 
          c.id,
          c.codigo,
          c.tipo,
          c.valor_descuento,
          c.usos,
          c.usos_maximos,
          c.fecha_inicio,
          c.fecha_fin,
          c.aplica_servicios,
          c.aplica_productos,
          c.estado
        FROM cupones c
        WHERE UPPER(c.codigo) = UPPER($1)
      `;

      const cuponResult = await client.query(cuponQuery, [
        saleData.cupon_codigo.trim(),
      ]);

      if (cuponResult.rows.length === 0) {
        throw new Error("Cupón no encontrado");
      }

      const cupon = cuponResult.rows[0];

      if (cupon.estado !== 1) {
        throw new Error("El cupón no está activo");
      }

      if (!cupon.aplica_productos) {
        throw new Error(
          "Este cupón solo aplica a servicios, no a productos"
        );
      }

      // 4.2 Validar sucursales (query separada)
      const sucursalesQuery = `
        SELECT sucursal_id 
        FROM cupon_sucursal 
        WHERE cupon_id = $1
      `;

      const sucursalesResult = await client.query(sucursalesQuery, [cupon.id]);
      const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

      if (
        sucursalesIds.length > 0 &&
        !sucursalesIds.includes(sucursal_id)
      ) {
        throw new Error(
          "El cupón no está disponible en esta sucursal"
        );
      }

      // 4.3 Validar vigencia
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

      // 4.4 Validar usos
      if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
        throw new Error("El cupón ha alcanzado su límite de usos");
      }

      // 4.5 Bloquear la fila del cupón ahora (sin GROUP BY)
      await client.query(
        `SELECT id FROM cupones WHERE id = $1 FOR UPDATE`,
        [cupon.id]
      );

      cuponId = cupon.id;

      // 4.6 Registrar uso
      await client.query(
        `UPDATE cupones SET usos = usos + 1 WHERE id = $1`,
        [cuponId]
      );
    }

    // ============================================
    // 5. Insertar venta
    // ============================================
    const insertSaleQuery = `
      INSERT INTO ventas_productos (
        subtotal, descuento, descripcion_descuento, total, 
        forma_pago, detalle_pago, sucursal_id, empleado_id, caja_id, 
        cupon_id, fecha
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TIMEZONE('America/La_Paz', NOW()))
      RETURNING id
    `;

    const saleValues = [
      saleData.subtotal,
      saleData.descuento,
      saleData.descripcion_descuento || "",
      saleData.total,
      saleData.forma_pago,
      saleData.detalle_pago || "",
      sucursal_id,
      empleado_id,
      caja_id,
      cuponId,
    ];

    const saleResult = await client.query(insertSaleQuery, saleValues);
    const ventaId = saleResult.rows[0].id;

    // ============================================
    // 6. Detalles y stock
    // ============================================
    for (const producto of saleData.productos) {
      await client.query(
        `INSERT INTO detalle_venta_productos (
          venta_producto_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          ventaId,
          producto.producto_id,
          producto.cantidad,
          producto.precio_unitario,
          producto.subtotal,
        ]
      );

      const stockCheck = await client.query(
        `SELECT stock IS NULL as sin_stock 
         FROM producto_sucursal 
         WHERE producto_id = $1 AND sucursal_id = $2`,
        [producto.producto_id, sucursal_id]
      );

      if (stockCheck.rows.length > 0 && !stockCheck.rows[0].sin_stock) {
        await client.query(
          `UPDATE producto_sucursal 
           SET stock = stock - $1
           WHERE producto_id = $2 AND sucursal_id = $3`,
          [producto.cantidad, producto.producto_id, sucursal_id]
        );
      }
    }

    // ============================================
    // 7. Movimiento de caja (efectivo)
    // ============================================
    const montoEfectivo =
      saleData.forma_pago === "efectivo"
        ? saleData.total
        : saleData.forma_pago === "mixto"
        ? saleData.monto_efectivo || 0
        : 0;

    if (montoEfectivo > 0) {
      const montoActual = montoAnteriorCaja + montoEfectivo;

      await client.query(
        `INSERT INTO movimientos_caja 
          (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual,
           venta_producto_id, fecha)
         VALUES ($1, $2, $3, 'ingreso', $4, $5, $6, $7, TIMEZONE('America/La_Paz', NOW()))`,
        [
          caja_id,
          userId,
          montoEfectivo,
          `Venta #${ventaId} - Productos (Efectivo)`,
          montoAnteriorCaja,
          montoActual,
          ventaId,
        ]
      );

      await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
        montoActual,
        caja_id,
      ]);
    }

    // ============================================
    // 8. Movimiento de caja (QR - informativo)
    // ============================================
    const montoQr =
      saleData.forma_pago === "qr"
        ? saleData.total
        : saleData.forma_pago === "mixto"
        ? saleData.monto_qr || 0
        : 0;

    if (montoQr > 0) {
      await client.query(
        `INSERT INTO movimientos_caja 
          (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual,
           venta_producto_id, fecha)
         VALUES ($1, $2, $3, 'ingreso', $4, $5, $5, $6, TIMEZONE('America/La_Paz', NOW()))`,
        [
          caja_id,
          userId,
          montoQr,
          `Venta #${ventaId} - Productos (QR - no afecta caja física)`,
          montoAnteriorCaja,
          ventaId,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      idventa: ventaId,
      mensaje: "Venta procesada correctamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en processSale service:", error);

    if (
      error.message.includes("stock insuficiente") ||
      error.message.includes("Stock insuficiente")
    ) {
      throw new Error(error.message);
    } else if (error.message.includes("caja no está abierta")) {
      throw new Error("La caja no está abierta. No se pueden realizar ventas.");
    } else if (error.message.includes("no hay caja activa")) {
      throw new Error("No hay caja activa para esta sucursal.");
    } else if (error.message.includes("usuario no encontrado")) {
      throw new Error(
        "Error de autenticación. Por favor, inicie sesión nuevamente."
      );
    } else if (error.message.includes("Cupón")) {
      throw new Error(error.message);
    } else {
      throw new Error("Error al procesar la venta: " + error.message);
    }
  } finally {
    client.release();
  }
};

module.exports = {
  getProducts,
  getCashRegisterStatus,
  processSale,
  validateCoupon,
};