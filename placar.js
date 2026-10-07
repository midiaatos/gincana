/* =========================================================================
   Placar da Gincana — núcleo compartilhado (telão, staff e página inicial)
   Script clássico (sem módulos), funciona no GitHub Pages e abrindo o
   arquivo direto do computador no modo demonstração.
   ========================================================================= */
(function () {
  "use strict";

  const FB_VERSAO = "10.12.2";
  const EQ = ["a", "b"]; // a = azul, b = verde

  /* ---------- utilidades ---------- */
  const sala = () => (new URLSearchParams(location.search).get("sala") || "").trim();
  const temFirebase = () => !!(window.PLACAR_FIREBASE && window.PLACAR_FIREBASE.databaseURL);

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MENOS = "\u2212";
  const fmt = (n) => (n < 0 ? MENOS + Math.abs(n) : String(n));
  const sinal = (n) => (n > 0 ? "+" + n : n < 0 ? MENOS + Math.abs(n) : "0");

  function haQuanto(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 5) return "agora";
    if (s < 60) return "há " + s + " s";
    const m = Math.round(s / 60);
    if (m < 60) return "há " + m + " min";
    return "há " + Math.round(m / 60) + " h";
  }
  const hora = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  function linkPara(pagina, codigo) {
    const u = new URL(pagina, location.href);
    u.search = codigo ? "?sala=" + encodeURIComponent(codigo) : "";
    u.hash = "";
    return u.href;
  }

  function gerarCodigo(tam) {
    const alfa = "abcdefghjkmnpqrstuvwxyz23456789";
    const v = new Uint32Array(tam || 12);
    crypto.getRandomValues(v);
    return Array.from(v, (x) => alfa[x % alfa.length]).join("");
  }

  function carregar(src) {
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => erro(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  /* Mantém a tela acesa (projetor e celulares) quando o navegador permite */
  function telaAcesa() {
    if (!("wakeLock" in navigator)) return;
    const pedir = () => navigator.wakeLock.request("screen").catch(() => {});
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && pedir());
    pedir();
  }

  /* ---------- logo: tira o fundo, recorta as sobras e reduz ---------- */
  function canvasDe(origem, w, h, sx, sy, sw, sh) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (sw) ctx.drawImage(origem, sx, sy, sw, sh, 0, 0, c.width, c.height);
    else ctx.drawImage(origem, 0, 0, c.width, c.height);
    return c;
  }

  /* Imagem que já tem transparência (PNG/WebP/SVG com fundo transparente) */
  function temTransparencia(c) {
    const w = c.width, h = c.height, d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250 && ++n > 20) return true;
    return false;
  }

  /* Remove o fundo liso (branco, preto ou de qualquer cor) ligado às bordas da imagem.
     Só age em imagens SEM transparência; logo com fundo transparente fica exatamente como veio. */
  function tirarFundo(c) {
    if (temTransparencia(c)) return false;
    const w = c.width, h = c.height, ctx = c.getContext("2d", { willReadFrequently: true });
    const im = ctx.getImageData(0, 0, w, h), d = im.data;
    const borda = [];
    for (let x = 0; x < w; x++) borda.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) borda.push(y * w, y * w + w - 1);

    // cor de fundo = grupo de cor mais comum na borda
    const grupos = new Map();
    for (const p of borda) {
      const i = p * 4;
      if (d[i + 3] < 128) continue;
      const chave = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const g = grupos.get(chave) || { n: 0, r: 0, g: 0, b: 0 };
      g.n++; g.r += d[i]; g.g += d[i + 1]; g.b += d[i + 2];
      grupos.set(chave, g);
    }
    let m = null;
    for (const g of grupos.values()) if (!m || g.n > m.n) m = g;
    if (!m) return false;
    const bg = [m.r / m.n, m.g / m.n, m.b / m.n];
    const dist = (i) => {
      const a = d[i] - bg[0], b = d[i + 1] - bg[1], cc = d[i + 2] - bg[2];
      return Math.sqrt(a * a + b * b + cc * cc);
    };

    // fundo precisa ser liso: boa parte da borda com a mesma cor
    let perto = 0;
    for (const p of borda) if (d[p * 4 + 3] >= 128 && dist(p * 4) < 40) perto++;
    if (perto < borda.length * 0.45) return false;

    // preenchimento a partir das bordas
    const T0 = 26, T1 = 62;
    const visto = new Uint8Array(w * h), fila = new Int32Array(w * h);
    let ini = 0, fim = 0;
    for (const p of borda) if (!visto[p] && dist(p * 4) < T1) { visto[p] = 1; fila[fim++] = p; }
    while (ini < fim) {
      const p = fila[ini++], x = p % w;
      if (x > 0 && !visto[p - 1] && dist((p - 1) * 4) < T1) { visto[p - 1] = 1; fila[fim++] = p - 1; }
      if (x < w - 1 && !visto[p + 1] && dist((p + 1) * 4) < T1) { visto[p + 1] = 1; fila[fim++] = p + 1; }
      if (p >= w && !visto[p - w] && dist((p - w) * 4) < T1) { visto[p - w] = 1; fila[fim++] = p - w; }
      if (p < w * (h - 1) && !visto[p + w] && dist((p + w) * 4) < T1) { visto[p + w] = 1; fila[fim++] = p + w; }
    }
    if (fim > w * h * 0.97) return false; // apagaria a logo inteira

    // transparente no fundo, transição suave nas bordas da logo (sem halo da cor antiga)
    for (let k = 0; k < fim; k++) {
      const i = fila[k] * 4, dd = dist(i);
      if (dd <= T0) { d[i + 3] = 0; continue; }
      const a = (dd - T0) / (T1 - T0);
      d[i + 3] = Math.round(d[i + 3] * a);
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, Math.round((d[i + ch] - bg[ch] * (1 - a)) / a)));
    }
    ctx.putImageData(im, 0, 0);
    return true;
  }

  /* Corta as margens vazias para a logo ocupar todo o espaço no telão */
  function recortarSobras(c) {
    const w = c.width, h = c.height, d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return c;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
    if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return c;
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
    return canvasDe(c, sw, sh, x0, y0, sw, sh);
  }

  function logoParaDataURL(arquivo, opcoes) {
    const o = Object.assign({ max: 420, semFundo: true }, opcoes || {});
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth || img.width || o.max;
          const h0 = img.naturalHeight || img.height || o.max;
          const k1 = Math.min(1, 900 / Math.max(w0, h0));         // tamanho de trabalho
          let c = canvasDe(img, w0 * k1, h0 * k1);
          URL.revokeObjectURL(img.src);
          if (o.semFundo) tirarFundo(c);
          c = recortarSobras(c);
          const k2 = Math.min(1, o.max / Math.max(c.width, c.height)); // tamanho final
          if (k2 < 1) c = canvasDe(c, c.width * k2, c.height * k2);
          ok(c.toDataURL("image/png")); // PNG preserva a transparência sem perda em qualquer navegador
        } catch (e) { erro(e); }
      };
      img.onerror = () => erro(new Error("Imagem inválida"));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  /* ---------- estado ---------- */
  function padrao() {
    const p = window.PLACAR_PADRAO || {};
    return {
      titulo: p.titulo || "Gincana",
      a: p.equipeAzul || "Equipe Azul",
      b: p.equipeVerde || "Equipe Verde",
    };
  }

  function normalizar(raw) {
    const r = raw || {};
    const d = padrao();
    const c = r.config || {};
    const e = c.equipes || {};
    return {
      config: {
        titulo: c.titulo || d.titulo,
        equipes: {
          a: { nome: (e.a && e.a.nome) || d.a, logo: (e.a && e.a.logo) || "" },
          b: { nome: (e.b && e.b.nome) || d.b, logo: (e.b && e.b.logo) || "" },
        },
      },
      jogos: r.jogos || {},
      aoVivo: r.aoVivo || null,
      lancamentos: r.lancamentos || {},
      relogio: normalizarRelogio(r.relogio),
    };
  }

  /* ---------- cronômetro e temporizador ---------- */
  function normalizarRelogio(raw) {
    const r = raw || {};
    const inicio = typeof r.inicio === "number" ? r.inicio : null;
    let estado = r.estado === "rodando" || r.estado === "pausado" ? r.estado : "parado";
    if (estado === "rodando" && inicio === null) estado = "pausado";
    return {
      modo: r.modo === "temporizador" ? "temporizador" : "cronometro",
      estado,
      inicio,
      acumulado: Math.max(0, Number(r.acumulado) || 0),
      duracao: Number(r.duracao) > 0 ? Number(r.duracao) : 60000,
      visivel: !!r.visivel,
    };
  }

  /* Tempo atual calculado a partir do horário do servidor: todos os aparelhos mostram o mesmo valor */
  function tempoRelogio(r, agora) {
    const rodando = r.estado === "rodando" && r.inicio !== null;
    const bruto = Math.max(0, r.acumulado + (rodando ? agora - r.inicio : 0));
    if (r.modo === "temporizador") {
      const restante = Math.max(0, r.duracao - bruto);
      return {
        modo: r.modo, estado: r.estado, rodando, bruto,
        valor: restante, decorrido: Math.min(bruto, r.duracao), duracao: r.duracao,
        fracao: r.duracao ? restante / r.duracao : 0,
        acabou: r.estado !== "parado" && restante <= 0,
      };
    }
    return { modo: r.modo, estado: r.estado, rodando, bruto, valor: bruto, decorrido: bruto, duracao: 0, fracao: 1, acabou: false };
  }

  function fmtRelogio(ms, modo) {
    const pad = (n) => String(n).padStart(2, "0");
    const total = modo === "temporizador" ? Math.ceil(ms / 1000 - 1e-6) : Math.floor(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return {
      txt: h ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s),
      dec: modo === "temporizador" ? "" : String(Math.floor((ms % 1000) / 100)),
    };
  }

  function fmtDuracao(ms) {
    const s = Math.round(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    if (!m) return r + " s";
    return r ? m + " min " + r + " s" : m + " min";
  }

  function limpo(o) {
    const out = {};
    for (const k in o) if (o[k] !== null && o[k] !== undefined && o[k] !== "") out[k] = o[k];
    return out;
  }

  /* Totais, placar por brincadeira, penalizações e vitórias */
  function computar(e, agora) {
    agora = agora || Date.now();
    const L = Object.keys(e.lancamentos)
      .map((id) => {
        const v = e.lancamentos[id] || {};
        return {
          id,
          equipe: v.equipe,
          pontos: Number(v.pontos) || 0,
          tipo: v.tipo || "ponto",
          jogo: v.jogo || null,
          motivo: v.motivo || "",
          por: v.por || "",
          ts: typeof v.ts === "number" ? v.ts : agora,
        };
      })
      .filter((l) => l.equipe === "a" || l.equipe === "b")
      .sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1));

    const total = { a: 0, b: 0 };
    const penal = { a: 0, b: 0 };
    const porJogo = {};
    for (const l of L) {
      total[l.equipe] += l.pontos;
      if (l.tipo === "penal") penal[l.equipe] -= l.pontos;
      if (l.jogo) (porJogo[l.jogo] = porJogo[l.jogo] || { a: 0, b: 0 })[l.equipe] += l.pontos;
    }

    const vitorias = { a: 0, b: 0 };
    const jogos = Object.keys(e.jogos)
      .map((id) => {
        const j = e.jogos[id] || {};
        return { id, nome: j.nome || "Brincadeira", ordem: j.ordem || 0, status: j.status || "aguardando", pts: porJogo[id] || { a: 0, b: 0 }, vencedor: null };
      })
      .sort((x, y) => x.ordem - y.ordem);
    for (const j of jogos) {
      if (j.status === "encerrado" && j.pts.a !== j.pts.b) {
        j.vencedor = j.pts.a > j.pts.b ? "a" : "b";
        vitorias[j.vencedor]++;
      }
    }
    const aoVivo = e.aoVivo && e.jogos[e.aoVivo] ? e.aoVivo : null;
    return { L, total, penal, jogos, vitorias, aoVivo };
  }

  /* ---------- adaptador Firebase (tempo real entre aparelhos) ---------- */
  async function adaptadorFirebase(codigo, aoMudar, aoConectar) {
    if (!window.firebase || !window.firebase.database) {
      await carregar("https://www.gstatic.com/firebasejs/" + FB_VERSAO + "/firebase-app-compat.js");
      await carregar("https://www.gstatic.com/firebasejs/" + FB_VERSAO + "/firebase-database-compat.js");
    }
    const fb = window.firebase;
    const app = fb.apps.length ? fb.app() : fb.initializeApp(window.PLACAR_FIREBASE);
    const db = app.database();
    const raiz = db.ref("salas/" + codigo);
    let offset = 0;
    db.ref(".info/serverTimeOffset").on("value", (s) => (offset = s.val() || 0));
    db.ref(".info/connected").on("value", (s) => aoConectar(s.val() ? "online" : "offline"));
    raiz.on("value", (s) => aoMudar(s.val()), (err) => aoConectar("negado", err));
    return {
      modo: "firebase",
      agora: () => Date.now() + offset,
      novoId: () => raiz.child("lancamentos").push().key,
      ts: () => fb.database.ServerValue.TIMESTAMP,
      aplicar: (upd) => raiz.update(upd).catch((err) => aoConectar("negado", err)),
    };
  }

  /* ---------- adaptador local (modo demonstração, mesmo navegador) ---------- */
  function adaptadorLocal(codigo, aoMudar, aoConectar) {
    const KEY = "placar-demo:" + codigo;
    const canal = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
    const ler = () => {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    };
    const avisar = () => aoMudar(ler());
    if (canal) canal.onmessage = avisar;
    window.addEventListener("storage", (e) => e.key === KEY && avisar());
    setTimeout(() => { aoConectar("demo"); avisar(); }, 0);
    return {
      modo: "demo",
      agora: () => Date.now(),
      novoId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      ts: () => Date.now(),
      aplicar: (upd) => {
        const o = ler();
        for (const caminho in upd) {
          const partes = caminho.split("/");
          let alvo = o;
          for (let i = 0; i < partes.length - 1; i++) {
            const p = partes[i];
            if (typeof alvo[p] !== "object" || alvo[p] === null) alvo[p] = {};
            alvo = alvo[p];
          }
          const k = partes[partes.length - 1];
          const v = upd[caminho];
          if (v === null || v === undefined) delete alvo[k];
          else alvo[k] = JSON.parse(JSON.stringify(v));
        }
        try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { alert("Armazenamento do navegador cheio. Use uma logo menor."); }
        if (canal) canal.postMessage(1);
        avisar();
        return Promise.resolve();
      },
    };
  }

  /* ---------- API usada pelas páginas ---------- */
  async function abrirSala(codigo, cb) {
    let estado = normalizar(null);
    const mudou = (raw) => { estado = normalizar(raw); cb.aoMudar(estado); };
    const adp = temFirebase()
      ? await adaptadorFirebase(codigo, mudou, cb.aoConectar)
      : adaptadorLocal(codigo || "demo", mudou, cb.aoConectar);
    const A = adp.aplicar;

    return {
      modo: adp.modo,
      agora: adp.agora,
      get estado() { return estado; },

      lancar(o) {
        const id = adp.novoId();
        const reg = limpo({ equipe: o.equipe, pontos: o.pontos, tipo: o.tipo || "ponto", jogo: o.jogo || null, motivo: o.motivo || "", por: o.por || "" });
        reg.ts = adp.ts();
        A({ ["lancamentos/" + id]: reg });
        return id;
      },
      desfazer: (id) => A({ ["lancamentos/" + id]: null }),

      novoJogo(nome) {
        const id = adp.novoId();
        A({ ["jogos/" + id]: { nome, ordem: Date.now(), status: "aguardando" } });
        return id;
      },
      renomearJogo: (id, nome) => A({ ["jogos/" + id + "/nome"]: nome }),
      statusJogo(id, status) {
        const upd = { ["jogos/" + id + "/status"]: status };
        if (status === "ao_vivo") {
          for (const jid in estado.jogos) {
            if (jid !== id && estado.jogos[jid].status === "ao_vivo") upd["jogos/" + jid + "/status"] = "aguardando";
          }
          upd.aoVivo = id;
        } else if (estado.aoVivo === id) {
          upd.aoVivo = null;
        }
        return A(upd);
      },
      excluirJogo(id) {
        const upd = { ["jogos/" + id]: null };
        for (const lid in estado.lancamentos) if (estado.lancamentos[lid].jogo === id) upd["lancamentos/" + lid] = null;
        if (estado.aoVivo === id) upd.aoVivo = null;
        return A(upd);
      },

      /* cronômetro e temporizador */
      relogioModo(modo) {
        const r = estado.relogio;
        return A({ relogio: { modo, estado: "parado", acumulado: 0, duracao: r.duracao, visivel: r.visivel } });
      },
      relogioIniciar() {
        const t = tempoRelogio(estado.relogio, adp.agora());
        if (t.rodando && !t.acabou) return Promise.resolve();
        const upd = { "relogio/estado": "rodando", "relogio/inicio": adp.ts(), "relogio/visivel": true };
        if (t.acabou) upd["relogio/acumulado"] = 0;
        return A(upd);
      },
      relogioPausar() {
        const t = tempoRelogio(estado.relogio, adp.agora());
        if (!t.rodando) return Promise.resolve();
        return A({ "relogio/estado": "pausado", "relogio/acumulado": Math.round(t.decorrido), "relogio/inicio": null });
      },
      relogioZerar: () => A({ "relogio/estado": "parado", "relogio/acumulado": 0, "relogio/inicio": null }),
      relogioDuracao: (ms) => A({ "relogio/duracao": Math.round(ms), "relogio/estado": "parado", "relogio/acumulado": 0, "relogio/inicio": null }),
      relogioAjustar(delta) {
        const r = estado.relogio, t = tempoRelogio(r, adp.agora());
        let nova = t.acabou && delta > 0 ? t.bruto + delta : r.duracao + delta;
        nova = Math.max(1000, Math.min(nova, t.bruto + 99 * 60000));
        return A({ "relogio/duracao": Math.round(nova) });
      },
      relogioVisivel: (v) => A({ "relogio/visivel": !!v }),

      config: (caminho, valor) => A({ ["config/" + caminho]: valor || null }),
      zerarPontos: () => A({ lancamentos: null }),
      apagarTudo: () => A({ lancamentos: null, jogos: null, aoVivo: null, relogio: null }),
    };
  }

  window.Placar = { EQ, sala, temFirebase, esc, fmt, sinal, haQuanto, hora, linkPara, gerarCodigo, telaAcesa, logoParaDataURL, computar, abrirSala, tempoRelogio, fmtRelogio, fmtDuracao };
})();
