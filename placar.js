/* =========================================================================
   Placar da Gincana — núcleo compartilhado (telão, staff e página inicial)
   Script clássico (sem módulos), funciona no GitHub Pages e abrindo o
   arquivo direto do computador no modo demonstração.
   ========================================================================= */
(function () {
  "use strict";

  const FB_VERSAO = "10.12.2";
  const MAX_EQUIPES = 8;

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

  /* ---------- cores das equipes ---------- */
  // c = cor principal, c1 = mais escura, c2 = mais clara, arco = degradê do medidor (esquerda para direita)
  const PALETA = [
    { nome: "Azul", c: "#3a8dff", c1: "#1f5bff", c2: "#45d2ff", arco: ["#3a8dff", "#48bfff", "#64e4f3"] },
    { nome: "Verde", c: "#22d47e", c1: "#0db464", c2: "#a6ee52", arco: ["#4fe0a0", "#6eef94", "#92f07c"] },
    { nome: "Vermelho", c: "#ff4d5e", c1: "#e0263a", c2: "#ff8f7a", arco: ["#ff3a4f", "#ff5f66", "#ff9a7f"] },
    { nome: "Amarelo", c: "#ffcf33", c1: "#f2a900", c2: "#fff27a", arco: ["#ffb300", "#ffd23f", "#fff27a"] },
    { nome: "Laranja", c: "#ff8a2b", c1: "#ef5f00", c2: "#ffc266", arco: ["#ff6a1f", "#ff8f33", "#ffc266"] },
    { nome: "Roxo", c: "#9c6bff", c1: "#7038ff", c2: "#c9a0ff", arco: ["#7a4dff", "#9c6bff", "#c9a0ff"] },
    { nome: "Rosa", c: "#ff5fb2", c1: "#ef2b8c", c2: "#ff9fd2", arco: ["#ff3f9f", "#ff5fb2", "#ff9fd2"] },
    { nome: "Ciano", c: "#22d3ee", c1: "#0aa5c6", c2: "#86f3ff", arco: ["#13b6d8", "#22d3ee", "#86f3ff"] },
    { nome: "Branco", c: "#e9eef4", c1: "#aeb9c7", c2: "#ffffff", arco: ["#b9c4d1", "#dde4ec", "#ffffff"] },
  ];
  const hexValido = (h) => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h);
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function rgbHsl(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  }
  function luminancia(hex) {
    const v = hexRgb(hex).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  /* Gera as variações de uma cor: presets usam os tons ajustados à mão, cor livre é calculada */
  function corEquipe(hex) {
    if (!hexValido(hex)) hex = PALETA[0].c;
    const p = PALETA.find((x) => x.c.toLowerCase() === hex.toLowerCase());
    let o;
    if (p) o = { c: p.c, c1: p.c1, c2: p.c2, arco: p.arco.slice() };
    else {
      let [h, s, l] = rgbHsl(hexRgb(hex));
      l = Math.max(50, Math.min(72, l)); // legível no fundo escuro do telão
      if (s > 12) s = Math.max(s, 60);
      o = {
        c: hslHex(h, s, l),
        c1: hslHex(h, s, l - 14),
        c2: hslHex(h - 18, s, Math.min(l + 14, 88)),
        arco: [hslHex(h, s, l), hslHex(h - 9, s, Math.min(l + 7, 84)), hslHex(h - 18, s, Math.min(l + 14, 88))],
      };
    }
    o.tx = luminancia(o.c2) > 0.35 ? "#05070a" : "#ffffff"; // texto sobre a cor
    return o;
  }
  /* Variáveis CSS por equipe: qualquer elemento com data-eq="id" herda --c, --c1, --c2 e --tx */
  function cssCores(e) {
    return e.config.lista.map((id) => {
      const k = e.config.equipes[id].pal;
      return '[data-eq="' + id + '"]{--c:' + k.c + ";--c1:" + k.c1 + ";--c2:" + k.c2 + ";--tx:" + k.tx + "}";
    }).join("\n");
  }
  function aplicarCores(e) {
    let st = document.getElementById("cores-equipes");
    if (!st) { st = document.createElement("style"); st.id = "cores-equipes"; document.head.appendChild(st); }
    const css = cssCores(e);
    if (st.textContent !== css) st.textContent = css;
  }
  function proximaCor(e) {
    const usadas = new Set(e.config.lista.map((id) => e.config.equipes[id].cor.toLowerCase()));
    const livre = PALETA.find((p) => !usadas.has(p.c.toLowerCase()));
    return (livre || PALETA[e.config.lista.length % PALETA.length]).c;
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
    const bruto = c.equipes || {};
    // "a" e "b" existem por padrão (azul e verde) até serem removidas; as demais são criadas em Ajustes
    const base = { a: { nome: d.a, cor: PALETA[0].c, ordem: 0 }, b: { nome: d.b, cor: PALETA[1].c, ordem: 1 } };
    const equipes = {};
    const ids = Array.from(new Set(Object.keys(base).concat(Object.keys(bruto))));
    for (const id of ids) {
      if (!/^[\w-]{1,40}$/.test(id)) continue;
      const v = bruto[id];
      if (!v && !base[id]) continue;
      if (v && v.removida) continue;
      const b = base[id] || { nome: "Equipe", cor: PALETA[5].c, ordem: 99 };
      const x = v || {};
      const cor = hexValido(x.cor) ? x.cor : b.cor;
      equipes[id] = { id, nome: x.nome || b.nome, logo: x.logo || "", cor, ordem: typeof x.ordem === "number" ? x.ordem : b.ordem, pal: corEquipe(cor) };
    }
    const lista = Object.keys(equipes).sort((x, y) => equipes[x].ordem - equipes[y].ordem || (x < y ? -1 : 1));
    return {
      config: {
        titulo: c.titulo || d.titulo,
        equipes,
        lista,
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
      .filter((l) => Object.prototype.hasOwnProperty.call(e.config.equipes, l.equipe))
      .sort((x, y) => x.ts - y.ts || (x.id < y.id ? -1 : 1));

    const ids = e.config.lista;
    const zero = () => { const o = {}; for (const i of ids) o[i] = 0; return o; };
    const total = zero(), penal = zero(), vitorias = zero(), porJogo = {};
    for (const l of L) {
      total[l.equipe] += l.pontos;
      if (l.tipo === "penal") penal[l.equipe] -= l.pontos;
      if (l.jogo) (porJogo[l.jogo] = porJogo[l.jogo] || zero())[l.equipe] += l.pontos;
    }

    // quem tem mais pontos sozinho; empate no topo = sem vencedor
    const topo = (pts) => {
      let melhor = null, max = -Infinity, empate = false;
      for (const i of ids) {
        if (pts[i] > max) { max = pts[i]; melhor = i; empate = false; } else if (pts[i] === max) empate = true;
      }
      return empate ? null : melhor;
    };

    const jogos = Object.keys(e.jogos)
      .map((id) => {
        const j = e.jogos[id] || {};
        return { id, nome: j.nome || "Brincadeira", ordem: j.ordem || 0, status: j.status || "aguardando", pts: porJogo[id] || zero(), vencedor: null };
      })
      .sort((x, y) => x.ordem - y.ordem);
    for (const j of jogos) {
      if (j.status === "encerrado") {
        j.vencedor = topo(j.pts);
        if (j.vencedor) vitorias[j.vencedor]++;
      }
    }

    // posição na classificação (empatados dividem a posição)
    const posicao = {};
    for (const i of ids) posicao[i] = 1 + ids.filter((o) => total[o] > total[i]).length;
    const lider = ids.length ? topo(total) : null;

    const aoVivo = e.aoVivo && e.jogos[e.aoVivo] ? e.aoVivo : null;
    return { L, ids, total, penal, jogos, vitorias, posicao, lider, aoVivo };
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

      /* equipes */
      novaEquipe(nome, cor) {
        if (estado.config.lista.length >= MAX_EQUIPES) return null;
        const id = adp.novoId().replace(/[^\w-]/g, "");
        const ordem = Math.max(-1, ...estado.config.lista.map((i) => estado.config.equipes[i].ordem)) + 1;
        A({ ["config/equipes/" + id]: { nome, cor: cor || proximaCor(estado), ordem } });
        return id;
      },
      removerEquipe(id) {
        if (estado.config.lista.length <= 2) return Promise.resolve();
        const upd = { ["config/equipes/" + id]: id === "a" || id === "b" ? { removida: true } : null };
        for (const lid in estado.lancamentos) if (estado.lancamentos[lid].equipe === id) upd["lancamentos/" + lid] = null;
        return A(upd);
      },
      zerarPontos: () => A({ lancamentos: null }),
      apagarTudo: () => A({ lancamentos: null, jogos: null, aoVivo: null, relogio: null }),
    };
  }

  window.Placar = { MAX_EQUIPES, PALETA, corEquipe, aplicarCores, proximaCor, sala, temFirebase, esc, fmt, sinal, haQuanto, hora, linkPara, gerarCodigo, telaAcesa, logoParaDataURL, computar, abrirSala, tempoRelogio, fmtRelogio, fmtDuracao };
})();
