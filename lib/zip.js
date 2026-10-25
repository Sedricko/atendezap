// AtendeZap — montador de .zip SEM compressão ("store"), feito à mão (sem biblioteca). Usado pelo "Exportar conversa" (v1.42).
// entradas: [{ nome, dados: string | Uint8Array | ArrayBuffer, data?: Date }]  →  { partes: Uint8Array[], tamanho }  (use new Blob(partes, { type: 'application/zip' })).
// Nomes em UTF-8 (bit 11 dos flags). Limites do formato clássico: até 65.535 arquivos e 4 GB (passou disso, avisa em vez de gerar arquivo inválido).
(() => {
  'use strict';
  const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TAB[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  const bytes = (d) => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d || 0));
  const dos = (d) => { const x = d instanceof Date && !isNaN(d) && d.getFullYear() >= 1980 ? d : new Date(2000, 0, 1); return { hora: (x.getHours() << 11) | (x.getMinutes() << 5) | (x.getSeconds() >> 1), dia: ((x.getFullYear() - 1980) << 9) | ((x.getMonth() + 1) << 5) | x.getDate() }; };
  const montar = (entradas) => {
    if (!Array.isArray(entradas) || entradas.length > 65535) throw new Error('arquivos demais para um .zip');
    const partes = [], central = []; let pos = 0;
    for (const e of entradas) {
      const nome = enc.encode(String(e.nome).replace(/\\/g, '/').replace(/^\/+/, '')), dados = bytes(e.dados), crc = crc32(dados), t = dos(e.data);
      if (nome.length > 65535 || dados.length > 0xFFFFFFFF) throw new Error('arquivo grande demais para um .zip');
      const lh = new DataView(new ArrayBuffer(30)); // cabeçalho local
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, t.hora, true); lh.setUint16(12, t.dia, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true); lh.setUint16(26, nome.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46)); // entrada do diretório central
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, t.hora, true); ch.setUint16(14, t.dia, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true); ch.setUint16(28, nome.length, true); ch.setUint32(42, pos, true);
      central.push(new Uint8Array(ch.buffer), nome);
      partes.push(new Uint8Array(lh.buffer), nome, dados); pos += 30 + nome.length + dados.length;
      if (pos > 0xFFFFFFFF - 1e6) throw new Error('o conjunto passou de 4 GB: exporte um intervalo menor');
    }
    let tamCentral = 0; for (const p of central) tamCentral += p.length;
    const fim = new DataView(new ArrayBuffer(22)); // fim do diretório central
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, entradas.length, true); fim.setUint16(10, entradas.length, true); fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    partes.push(...central, new Uint8Array(fim.buffer));
    return { partes, tamanho: pos + tamCentral + 22 };
  };
  globalThis.AZZIP = { crc32, montar };
})();
