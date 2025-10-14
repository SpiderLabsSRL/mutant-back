const crypto = require('crypto');

// Función para generar firma digital de datos biométricos RAW
async function generateFingerprintSignature(buffer) {
  try {
    // Para datos RAW, usar métodos más simples basados en el buffer
    const data = buffer.toString('base64');
    
    let complexity = 0;
    let transitions = 0;
    let uniqueBytes = new Set();
    let entropy = 0;
    
    // Analizar patrones en los datos RAW
    for (let i = 0; i < Math.min(buffer.length, 5000); i++) {
      uniqueBytes.add(buffer[i]);
      if (i > 0 && buffer[i] !== buffer[i-1]) {
        transitions++;
      }
      if (i > 2 && buffer[i] !== buffer[i-2]) {
        complexity++;
      }
    }

    // Calcular entropía de los datos
    const byteCounts = new Array(256).fill(0);
    for (let i = 0; i < Math.min(buffer.length, 10000); i++) {
      byteCounts[buffer[i]]++;
    }
    
    const totalBytes = Math.min(buffer.length, 10000);
    for (let i = 0; i < 256; i++) {
      if (byteCounts[i] > 0) {
        const probability = byteCounts[i] / totalBytes;
        entropy -= probability * Math.log2(probability);
      }
    }

    const signatureData = {
      uniqueBytes: uniqueBytes.size,
      transitions: transitions,
      complexity: complexity,
      entropy: entropy,
      length: buffer.length,
      dataHash: crypto.createHash('md5').update(buffer).digest('hex'),
      sampleHash: crypto.createHash('sha1').update(buffer.slice(0, Math.min(1000, buffer.length))).digest('hex')
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(signatureData)).digest('hex');

    return {
      hash: hash,
      features: signatureData,
      dataSize: buffer.length,
      dataType: "raw_biometric"
    };

  } catch (error) {
    console.warn('⚠️ Usando método de firma simple para datos RAW');
    return generateSimpleSignature(buffer);
  }
}

// Función de fallback simple para datos RAW
function generateSimpleSignature(buffer) {
  const dataHash = crypto.createHash('md5').update(buffer).digest('hex');
  const size = buffer.length;
  
  const signatureData = {
    dataHash: dataHash,
    size: size,
    timestamp: new Date().toISOString()
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(signatureData)).digest('hex');

  return {
    hash: hash,
    features: signatureData,
    dataSize: size,
    dataType: "raw_biometric_simple"
  };
}

// Función MEJORADA para calcular similitud con debugging
function calculateSignatureSimilarity(sig1, sig2) {
  console.log("   🔍 Iniciando cálculo de similitud...");
  
  // Verificación exhaustiva de las firmas
  if (!sig1 || !sig2) {
    console.error("   ❌ Error: Una o ambas firmas son nulas");
    return 0;
  }

  if (!sig1.hash || !sig2.hash) {
    console.error("   ❌ Error: Faltan hashes en las firmas");
    return 0;
  }

  console.log(`   🔑 Hash 1: ${sig1.hash.substring(0, 16)}...`);
  console.log(`   🔑 Hash 2: ${sig2.hash.substring(0, 16)}...`);
  console.log(`   📊 Tipo datos 1: ${sig1.dataType}`);
  console.log(`   📊 Tipo datos 2: ${sig2.dataType}`);

  let totalScore = 0;
  let weightSum = 0;

  // 1. Comparar hash principal (40% peso)
  const hashSimilarity = sig1.hash === sig2.hash ? 100 : 0;
  totalScore += hashSimilarity * 0.4;
  weightSum += 0.4;
  console.log(`   📈 Similitud de hash: ${hashSimilarity}%`);

  // 2. Comparar características si existen
  if (sig1.features && sig2.features) {
    console.log("   📋 Comparando características...");

    // Hash de datos (30%)
    if (sig1.features.dataHash && sig2.features.dataHash) {
      const dataHashSimilarity = sig1.features.dataHash === sig2.features.dataHash ? 100 : 0;
      totalScore += dataHashSimilarity * 0.3;
      weightSum += 0.3;
      console.log(`   🔍 Similitud dataHash: ${dataHashSimilarity}%`);
    } else {
      console.log("   ⚠️  dataHash no disponible");
    }

    // Tamaño de datos (10%)
    if (sig1.features.size !== undefined && sig2.features.size !== undefined) {
      const size1 = Number(sig1.features.size);
      const size2 = Number(sig2.features.size);
      
      if (!isNaN(size1) && !isNaN(size2) && size1 > 0 && size2 > 0) {
        const sizeDiff = Math.abs(size1 - size2);
        const sizeSimilarity = Math.max(0, 100 - (sizeDiff / Math.max(size1, size2)) * 100);
        totalScore += sizeSimilarity * 0.1;
        weightSum += 0.1;
        console.log(`   📏 Similitud tamaño: ${sizeSimilarity.toFixed(2)}% (${size1} vs ${size2})`);
      } else {
        console.log("   ⚠️  Tamaños inválidos");
      }
    } else if (sig1.dataSize && sig2.dataSize) {
      // Usar dataSize como fallback
      const size1 = Number(sig1.dataSize);
      const size2 = Number(sig2.dataSize);
      
      if (!isNaN(size1) && !isNaN(size2) && size1 > 0 && size2 > 0) {
        const sizeDiff = Math.abs(size1 - size2);
        const sizeSimilarity = Math.max(0, 100 - (sizeDiff / Math.max(size1, size2)) * 100);
        totalScore += sizeSimilarity * 0.1;
        weightSum += 0.1;
        console.log(`   📏 Similitud dataSize: ${sizeSimilarity.toFixed(2)}% (${size1} vs ${size2})`);
      }
    }

    // Bytes únicos (10%)
    if (sig1.features.uniqueBytes !== undefined && sig2.features.uniqueBytes !== undefined) {
      const unique1 = Number(sig1.features.uniqueBytes);
      const unique2 = Number(sig2.features.uniqueBytes);
      
      if (!isNaN(unique1) && !isNaN(unique2) && unique1 > 0 && unique2 > 0) {
        const uniqueDiff = Math.abs(unique1 - unique2);
        const uniqueSimilarity = Math.max(0, 100 - (uniqueDiff / Math.max(unique1, unique2)) * 100);
        totalScore += uniqueSimilarity * 0.1;
        weightSum += 0.1;
        console.log(`   🔢 Similitud bytes únicos: ${uniqueSimilarity.toFixed(2)}% (${unique1} vs ${unique2})`);
      }
    }

    // Complejidad (10%)
    if (sig1.features.complexity !== undefined && sig2.features.complexity !== undefined) {
      const comp1 = Number(sig1.features.complexity);
      const comp2 = Number(sig2.features.complexity);
      
      if (!isNaN(comp1) && !isNaN(comp2)) {
        const compDiff = Math.abs(comp1 - comp2);
        const maxComp = Math.max(comp1, comp2, 1); // Evitar división por cero
        const compSimilarity = Math.max(0, 100 - (compDiff / maxComp) * 100);
        totalScore += compSimilarity * 0.1;
        weightSum += 0.1;
        console.log(`   🎯 Similitud complejidad: ${compSimilarity.toFixed(2)}% (${comp1} vs ${comp2})`);
      }
    }
  } else {
    console.log("   ⚠️  Características no disponibles");
  }

  const finalScore = weightSum > 0 ? totalScore / weightSum : 0;

  console.log(`   📊 Puntuación final: ${finalScore.toFixed(2)}% (peso total: ${weightSum})`);

  // Ajustar score si los hashes no coinciden
  if (hashSimilarity === 0 && finalScore > 70) {
    const adjustedScore = finalScore * 0.3;
    console.log(`   ⚖️  Score ajustado (hash diferente): ${adjustedScore.toFixed(2)}%`);
    return Math.min(100, Math.max(0, adjustedScore));
  }

  return Math.min(100, Math.max(0, finalScore));
}

module.exports = {
  generateFingerprintSignature,
  calculateSignatureSimilarity
};