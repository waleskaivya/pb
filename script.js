// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================
const supabaseUrl = 'https://qzycmnnjtzuvshkasypr.supabase.co';
const supabaseKey = 'sb_publishable_aLM2nvWKe0Tay9v9GStaDQ_T1nKI0tJ';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ============================================================
// 2. TOKEN DO AUTOR
// ============================================================
let meuToken = localStorage.getItem('meu_token_autor');
if (!meuToken) {
  meuToken = crypto.randomUUID();
  localStorage.setItem('meu_token_autor', meuToken);
}

// ============================================================
// 3. ESTADO DO ADMIN
// ============================================================
let adminLogado = false;

// ============================================================
// 4. CORES E LABELS  (nova categoria: imovel_abandonado)
// ============================================================
const catColors = {
  alagamento:        '#F47700',
  pavimentacao:      '#ffce47',
  calcada:           '#13BFF2',
  iluminacao:        '#625DB4',
  acessibilidade:    '#AC1149',
  lixo:              '#93CC16',
  sinalizacao:       '#41889D',
  meio_ambiente:     '#D51EDC',
  imovel_abandonado: '#437363'
};

const catLabels = {
  alagamento:        'Alagamento',
  pavimentacao:      'Pavimentação',
  calcada:           'Calçada',
  iluminacao:        'Iluminação',
  acessibilidade:    'Acessibilidade',
  lixo:              'Lixo',
  sinalizacao:       'Sinalização',
  meio_ambiente:     'Meio Ambiente',
  imovel_abandonado: 'Imóvel Abandonado'
};

// ============================================================
// 5. MAPA
// ============================================================
const limitesPatoBranco = [[-26.33, -52.83], [-26.05, -52.55]];

const map = L.map('map', {
  maxZoom: 20,
  minZoom: 13,
  maxBounds: limitesPatoBranco,
  maxBoundsViscosity: 1.0
}).setView([-26.2289, -52.6703], 14);

L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: '0123',
  attribution: '© Google Maps',
  maxZoom: 20,
  maxNativeZoom: 20
}).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 20,
  maxNativeZoom: 19,
  opacity: 0.6
}).addTo(map);

// ============================================================
// 6. LEGENDA
// ============================================================
const legendDiv = document.getElementById('map-legend');
legendDiv.innerHTML = '<strong id="legend-title" style="cursor:pointer;user-select:none;">Categorias <span id="legend-arrow">▲</span></strong>';
Object.keys(catColors).forEach(cat => {
  const item = document.createElement('div');
  item.className = 'leg-item';
  item.innerHTML = `<span class="leg-dot" style="background:${catColors[cat]}"></span>${catLabels[cat]}`;
  legendDiv.appendChild(item);
});

// Toggle recolher/expandir legenda
document.getElementById('legend-title').addEventListener('click', () => {
  const items = legendDiv.querySelectorAll('.leg-item');
  const arrow = document.getElementById('legend-arrow');
  const recolhido = items[0].style.display === 'none';
  items.forEach(el => el.style.display = recolhido ? 'flex' : 'none');
  arrow.textContent = recolhido ? '▲' : '▼';
});

// ============================================================
// 7. ESTADO LOCAL + CLUSTER
// ============================================================
let markers = [];
let pendingLatLng = null;
let filtroAtivo = 'todos';
let heatAtivo = false;
let heatLayer = null;

// Cluster group — agrupa marcadores próximos com círculo numérico
const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 50,
  showCoverageOnHover: false,
  iconCreateFunction: function(cluster) {
    const count = cluster.getChildCount();
    let size = 32, fontSize = 13;
    if (count >= 50) { size = 46; fontSize = 16; }
    else if (count >= 20) { size = 40; fontSize = 15; }
    else if (count >= 10) { size = 36; fontSize = 14; }
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:rgb(221, 34, 34);
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:700;font-size:${fontSize}px;
        font-family:system-ui,sans-serif;
      ">${count}</div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2]
    });
  }
});
clusterGroup.addTo(map);

function makeIcon(color, denunciado, fotoPendente) {
  if (denunciado && adminLogado) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:27px;height:27px;border-radius:50%;
        background:#e53935;border:3px solid white;
        box-shadow:0 0 0 5px rgba(229,57,53,0.35),0 1px 5px rgba(0,0,0,0.35);
        animation:pulso 1.5s ease-in-out infinite;
      "></div>`,
      iconSize: [27, 27],
      iconAnchor: [13.5, 13.5]
    });
  }
  if (fotoPendente && adminLogado) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:27px;height:27px;border-radius:50%;
        background:${color};border:3px solid white;
        box-shadow:0 0 0 5px rgba(214,150,0,0.45),0 1px 5px rgba(0,0,0,0.35);
        animation:pulso 1.5s ease-in-out infinite;
      "></div>`,
      iconSize: [27, 27],
      iconAnchor: [13.5, 13.5]
    });
  }
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function updateCounter() {
  const total = filtroAtivo === 'todos'
    ? markers.length
    : markers.filter(m => m.cat === filtroAtivo).length;
  document.getElementById('counter').textContent = `${total} registros no mapa`;

  if (heatAtivo) atualizarHeatmap();
}

// ============================================================
// 7B. MAPA DE CALOR POR DENSIDADE
// ============================================================
function pontosParaHeatmap() {
  return markers
    .filter(m => filtroAtivo === 'todos' || m.cat === filtroAtivo)
    .map(m => {
      const ll = m.marker.getLatLng();
      return [ll.lat, ll.lng, 0.6];
    });
}

function atualizarHeatmap() {
  if (!heatLayer || !map.hasLayer(heatLayer)) return;
  heatLayer.setLatLngs(pontosParaHeatmap());
}

function criarHeatLayerSeNecessario() {
  if (!heatLayer) {
    heatLayer = L.heatLayer([], {
      radius: 14,
      blur: 11,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: {
        0.0:  '#2f6fd6',
        0.45: '#2f6fd6',
        0.6:  '#4fb8c9',
        0.78: '#7fc94a',
        0.9:  '#f0a324',
        1.0:  '#e6432f'
      }
    });
  }
  return heatLayer;
}

function toggleHeatmap() {
  heatAtivo = !heatAtivo;
  const btn = document.getElementById('btn-heat-toggle');

  if (heatAtivo) {
    criarHeatLayerSeNecessario();
    if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
    heatLayer.addTo(map);
    heatLayer.setLatLngs(pontosParaHeatmap());
    legendDiv.style.display = 'none';
    document.getElementById('heat-legend').style.display = 'block';
    btn.classList.add('active');
    btn.title = 'Ver registros individuais';
  } else {
    if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
    clusterGroup.addTo(map);
    legendDiv.style.display = filtroAtivo === 'todos' ? '' : 'none';
    document.getElementById('heat-legend').style.display = 'none';
    btn.classList.remove('active');
    btn.title = 'Ver mapa de calor por densidade';
  }
}

const HeatToggleControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function() {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control heat-toggle-control');
    const btn = L.DomUtil.create('a', '', container);
    btn.href = '#';
    btn.id = 'btn-heat-toggle';
    btn.title = 'Ver mapa de calor por densidade';
    btn.innerHTML = '<span aria-hidden="true">🔥</span>';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(btn, 'click', function(e) {
      L.DomEvent.stop(e);
      toggleHeatmap();
    });
    return container;
  }
});
map.addControl(new HeatToggleControl());

// ============================================================
// 8. FLUXO DE BOAS-VINDAS
// ============================================================
function mostrarHintInstrucao() {
  document.getElementById('hint-box').style.display = 'flex';
}

function fecharBoasVindas(viaOK) {
  if (viaOK && document.getElementById('nao-mostrar-novamente').checked) {
    localStorage.setItem('uc_nao_mostrar_boasvindas', '1');
  }
  document.getElementById('modal-sobre').classList.remove('open');
  mostrarHintInstrucao();
}

document.getElementById('btn-fechar-sobre-ok').addEventListener('click', () => fecharBoasVindas(true));
document.getElementById('modal-sobre').addEventListener('click', function(e) {
  if (e.target === this) fecharBoasVindas(false);
});

document.getElementById('titulo-urbano-comum').addEventListener('click', () => {
  document.getElementById('hint-box').style.display = 'none';
  document.getElementById('modal-sobre').classList.add('open');
});

window.addEventListener('load', () => {
  const naoMostrar = localStorage.getItem('uc_nao_mostrar_boasvindas');
  if (naoMostrar === '1') {
    mostrarHintInstrucao();
  } else {
    document.getElementById('modal-sobre').classList.add('open');
  }
});

// ============================================================
// 9. FECHAR HINT
// ============================================================
document.getElementById('close-hint').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('hint-box').style.display = 'none';
});

// ============================================================
// 9b. FOTO — PREVIEW NO MODAL
// ============================================================
const fotoInput    = document.getElementById('foto-input');
const fotoPreview  = document.getElementById('foto-preview');
const fotoWrap     = document.getElementById('foto-preview-wrap');
const fotoLabel    = document.getElementById('foto-label-texto');
const fotoRemover  = document.getElementById('foto-remover');
let   fotoArquivo  = null;

// Configurações de compressão
const FOTO_MAX_LARGURA  = 1280;  // px — suficiente para visualização no mapa
const FOTO_MAX_ALTURA   = 1280;  // px
const FOTO_QUALIDADE    = 0.82;  // 0-1 — 82% mantém boa qualidade visual
const FOTO_MAX_BYTES    = 5 * 1024 * 1024; // bloqueia arquivos acima de 5MB antes de processar

function comprimirFoto(file) {
  return new Promise((resolve, reject) => {
    if (file.size > FOTO_MAX_BYTES) {
      reject(new Error(`Foto muito grande (${(file.size/1024/1024).toFixed(1)}MB). Máximo permitido: 5MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida.'));
      img.onload = () => {
        // Calcula dimensões mantendo proporção
        let { width, height } = img;
        if (width > FOTO_MAX_LARGURA || height > FOTO_MAX_ALTURA) {
          const ratio = Math.min(FOTO_MAX_LARGURA / width, FOTO_MAX_ALTURA / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Falha na compressão.')); return; }
          // Cria um File a partir do blob comprimido
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve({ blob: compressed, dataUrl: canvas.toDataURL('image/jpeg', FOTO_QUALIDADE) });
        }, 'image/jpeg', FOTO_QUALIDADE);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

fotoInput.addEventListener('change', async function() {
  const file = this.files[0];
  if (!file) return;

  fotoLabel.textContent = 'Processando...';

  try {
    const { blob, dataUrl } = await comprimirFoto(file);
    fotoArquivo = blob;
    fotoPreview.src = dataUrl;
    fotoWrap.style.display = 'block';

    const tamanhoOriginal   = (file.size / 1024).toFixed(0);
    const tamanhoComprimido = (blob.size  / 1024).toFixed(0);
    fotoLabel.textContent = `✓ ${file.name} (${tamanhoOriginal}KB → ${tamanhoComprimido}KB)`;
  } catch (err) {
    fotoArquivo = null;
    fotoInput.value = '';
    fotoWrap.style.display = 'none';
    fotoLabel.textContent = 'Anexar foto';
    alert(err.message);
  }
});

fotoRemover.addEventListener('click', () => {
  fotoArquivo = null;
  fotoInput.value = '';
  fotoWrap.style.display = 'none';
  fotoLabel.textContent  = 'Anexar foto';
});

function limparFoto() {
  fotoArquivo = null;
  fotoInput.value = '';
  fotoWrap.style.display = 'none';
  fotoLabel.textContent  = 'Anexar foto';
}

// ============================================================
// 9d. PAINEL DE MODERAÇÃO (admin)
// ============================================================
const motivosReprovacao = [
  { valor: 'reprovada_dados',    label: 'Dados pessoais (rosto ou placa)' },
  { valor: 'reprovada_qualidade',label: 'Qualidade ruim (foto ilegível)'  },
  { valor: 'reprovada_impr',     label: 'Conteúdo incompatível'           },
];

async function atualizarFilaModeracaoBadge() {
  if (!adminLogado) return;
  const [resFotos, resDen, resSug] = await Promise.all([
    supabaseClient.from('registros').select('id', { count: 'exact', head: true }).eq('foto_status', 'analise'),
    supabaseClient.from('registros').select('id', { count: 'exact', head: true }).neq('denuncias', '[]'),
    supabaseClient.from('sugestoes').select('id',  { count: 'exact', head: true }).eq('lida', false)
  ]);
  const qtd = (resFotos.count || 0) + (resDen.count || 0) + (resSug.count || 0);
  const badge = document.getElementById('badge-moderacao');
  if (qtd > 0) {
    badge.style.display = 'inline-block';
    badge.textContent   = qtd > 9 ? '9+' : qtd;
  } else {
    badge.style.display = 'none';
  }
}

async function carregarFilaModeracao() {
  const lista = document.getElementById('moderacao-lista');
  const vazio = document.getElementById('moderacao-vazio');
  lista.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);text-align:center;padding:12px 0;">Carregando...</p>';

  // Busca fotos pendentes, pontos denunciados e sugestões em paralelo
  const [resFotos, resDenuncias, resSugestoes] = await Promise.all([
    supabaseClient.from('registros')
      .select('id, categoria, descricao, lat, lng, foto_url, foto_status, criado_em')
      .eq('foto_status', 'analise')
      .order('criado_em', { ascending: true }),
    supabaseClient.from('registros')
      .select('id, categoria, descricao, lat, lng, denuncias, criado_em')
      .neq('denuncias', '[]')
      .order('criado_em', { ascending: true }),
    supabaseClient.from('sugestoes')
      .select('id, texto, contato, criado_em')
      .eq('lida', false)
      .order('criado_em', { ascending: true })
  ]);

  lista.innerHTML = '';
  const fotos      = resFotos.data      || [];
  const denuncias  = resDenuncias.data  || [];
  const sugestoes  = resSugestoes.data  || [];

  if (fotos.length === 0 && denuncias.length === 0 && sugestoes.length === 0) {
    vazio.style.display = 'block';
    return;
  }
  vazio.style.display = 'none';

  // ── Seção: Fotos para aprovação ──
  if (fotos.length > 0) {
    const secHeader = document.createElement('div');
    secHeader.innerHTML = `<div class="gear-section-label" style="padding:6px 2px 4px;">🖼 Fotos aguardando aprovação (${fotos.length})</div>`;
    lista.appendChild(secHeader);

    fotos.forEach(reg => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-surface);margin-bottom:2px;';
      const dataF = new Date(reg.criado_em).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });

      card.innerHTML = `
        <div style="padding:8px 12px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;" class="card-zoom-header" data-lat="${reg.lat}" data-lng="${reg.lng}" data-id="${reg.id}">
          <div>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${catLabels[reg.categoria] || reg.categoria}</span>
            ${reg.descricao ? `<span style="font-size:12px;color:var(--text-secondary);"> — ${reg.descricao.substring(0,40)}${reg.descricao.length>40?'…':''}</span>` : ''}
          </div>
          <span style="font-size:10px;color:var(--text-secondary);white-space:nowrap;">${dataF} 🔍</span>
        </div>
        <div style="padding:10px 12px;">
          <img src="${reg.foto_url}" alt="Foto para moderação"
            style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--border-light);display:block;margin-bottom:10px;cursor:pointer;" title="Clique para ampliar"
            onclick="this.style.maxHeight = this.style.maxHeight === 'none' ? '120px' : 'none'"
            onerror="this.style.display='none'" />
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button class="btn-save" style="font-size:12px;padding:6px 14px;" data-id="${reg.id}" data-acao="aprovar">Aprovar</button>
            <select class="motivo-select" data-id="${reg.id}" style="font-size:12px;padding:6px 8px;border:1px solid var(--input-border);border-radius:8px;background:var(--bg-surface);color:var(--text-primary);font-family:inherit;flex:1;min-width:160px;">
              <option value="">Reprovar — selecione o motivo...</option>
              ${motivosReprovacao.map(m => `<option value="${m.valor}">${m.label}</option>`).join('')}
            </select>
          </div>
        </div>
      `;

      // Zoom ao clicar no cabeçalho
      card.querySelector('.card-zoom-header').addEventListener('click', () => {
        document.getElementById('modal-moderacao').classList.remove('open');
        map.setView([reg.lat, reg.lng], 17, { animate: true });
        const item = markers.find(m => m.id === reg.id);
        if (item) setTimeout(() => item.marker.openPopup(), 400);
      });

      card.querySelector('[data-acao="aprovar"]').addEventListener('click', async () => {
        await moderarFoto(reg.id, 'aprovada', card);
      });

      card.querySelector('.motivo-select').addEventListener('change', async function() {
        if (!this.value) return;
        const motivo = this.value;
        if (!confirm(`Reprovar como "${motivosReprovacao.find(m=>m.valor===motivo).label}"?`)) { this.value=''; return; }
        await moderarFoto(reg.id, motivo, card, motivo === 'reprovada_impr');
      });

      lista.appendChild(card);
    });
  }

  // ── Seção: Pontos denunciados ──
  if (denuncias.length > 0) {
    const secHeader = document.createElement('div');
    secHeader.innerHTML = `<div class="gear-section-label" style="padding:10px 2px 4px;">⚠ Pontos denunciados (${denuncias.length})</div>`;
    lista.appendChild(secHeader);

    denuncias.forEach(reg => {
      const qtd  = Array.isArray(reg.denuncias) ? reg.denuncias.length : 0;
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid rgba(229,57,53,0.3);border-radius:8px;background:var(--bg-surface);margin-bottom:2px;overflow:hidden;';
      const dataF = new Date(reg.criado_em).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });

      card.innerHTML = `
        <div style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;" class="card-zoom-header" data-lat="${reg.lat}" data-lng="${reg.lng}" data-id="${reg.id}">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${catLabels[reg.categoria] || reg.categoria}</span>
            ${reg.descricao ? `<span style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"> — ${reg.descricao}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="padding:2px 8px;background:#e53935;color:white;border-radius:10px;font-size:10px;font-weight:600;">⚑ ${qtd} denúncia${qtd>1?'s':''}</span>
            <span style="font-size:10px;color:var(--text-secondary);">🔍 ver</span>
          </div>
        </div>
        <div style="padding:0 12px 10px;display:flex;gap:6px;">
          <button class="btn-save" style="font-size:12px;padding:5px 12px;" data-id="${reg.id}" data-acao="ignorar">Ignorar denúncias</button>
          <button class="btn-cancel" style="font-size:12px;padding:5px 12px;color:#e53935;border-color:#e53935;" data-id="${reg.id}" data-acao="excluir-ponto">Excluir ponto</button>
        </div>
      `;

      card.querySelector('.card-zoom-header').addEventListener('click', () => {
        document.getElementById('modal-moderacao').classList.remove('open');
        map.setView([reg.lat, reg.lng], 17, { animate: true });
        const item = markers.find(m => m.id === reg.id);
        if (item) setTimeout(() => item.marker.openPopup(), 400);
      });

      card.querySelector('[data-acao="ignorar"]').addEventListener('click', async () => {
        await supabaseClient.from('registros').update({ denuncias: [] }).eq('id', reg.id);
        const item = markers.find(m => m.id === reg.id);
        if (item) {
          item.marker._registroData.denuncias = 0;
          item.marker._registroData.denunciasTokens = [];
          item.marker._registroData.denunciado = false;
          item.denunciado = false;
          const cor = catColors[item.marker._registroData.categoria] || '#999';
          item.marker.setIcon(makeIcon(cor, false, item.marker._registroData.foto_status === 'analise'));
          item.marker.setPopupContent(montarPopup(item.marker._registroData));
        }
        animarRemocaoCard(card, lista, vazio);
        atualizarFilaModeracaoBadge();
      });

      card.querySelector('[data-acao="excluir-ponto"]').addEventListener('click', async () => {
        if (!confirm('Excluir este ponto permanentemente?')) return;
        await supabaseClient.from('registros').delete().eq('id', reg.id);
        const idx = markers.findIndex(m => m.id === reg.id);
        if (idx !== -1) { markers[idx].marker.remove(); markers.splice(idx, 1); updateCounter(); }
        animarRemocaoCard(card, lista, vazio);
        atualizarFilaModeracaoBadge();
      });

      lista.appendChild(card);
    });
  }

  // ── Seção: Sugestões ──
  if (sugestoes.length > 0) {
    const secSug = document.createElement('div');
    secSug.innerHTML = `<div class="gear-section-label" style="padding:10px 2px 4px;">💡 Sugestões (${sugestoes.length})</div>`;
    lista.appendChild(secSug);

    sugestoes.forEach(sug => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--border-color);border-radius:8px;background:var(--bg-surface);margin-bottom:2px;overflow:hidden;';
      const dataF = new Date(sug.criado_em).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
      card.innerHTML = `
        <div style="padding:10px 12px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:600;color:var(--text-primary);">Sugestão</span>
            <span style="font-size:10px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0;">${dataF}</span>
          </div>
          <p style="font-size:13px;color:var(--text-primary);line-height:1.5;margin:0 0 6px;">${sug.texto}</p>
          ${sug.contato ? `<p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px;">Contato: ${sug.contato}</p>` : ''}
          <button class="btn-cancel" style="font-size:12px;padding:5px 12px;" data-acao="marcar-lida">Marcar como lida</button>
        </div>
      `;
      card.querySelector('[data-acao="marcar-lida"]').addEventListener('click', async () => {
        await supabaseClient.from('sugestoes').update({ lida: true }).eq('id', sug.id);
        animarRemocaoCard(card, lista, vazio);
        atualizarFilaModeracaoBadge();
      });
      lista.appendChild(card);
    });
  }

  atualizarFilaModeracaoBadge();
}

function animarRemocaoCard(card, lista, vazio) {
  card.style.transition = 'opacity 0.3s';
  card.style.opacity = '0';
  setTimeout(() => {
    card.remove();
    // Remove cabeçalhos de seção vazios
    lista.querySelectorAll('.gear-section-label').forEach(h => {
      const next = h.parentElement?.nextElementSibling;
      if (!next || next.classList?.contains('gear-section-label')) h.parentElement?.remove();
    });
    if (lista.querySelectorAll('[style*="border"]').length === 0) {
      vazio.style.display = 'block';
    }
  }, 300);
}

async function moderarFoto(id, novoStatus, card, removerPonto = false) {
  await supabaseClient.from('registros').update({ foto_status: novoStatus }).eq('id', id);

  // Atualiza o marcador no mapa
  const item = markers.find(m => m.id === id);
  if (item) {
    item.marker._registroData.foto_status = novoStatus;
    const cor = catColors[item.marker._registroData.categoria] || '#999';
    item.marker.setIcon(makeIcon(cor, item.marker._registroData.denunciado, false));
    item.marker.setPopupContent(montarPopup(item.marker._registroData));
  }

  if (removerPonto) {
    await supabaseClient.from('registros').delete().eq('id', id);
    const idx = markers.findIndex(m => m.id === id);
    if (idx !== -1) { markers[idx].marker.remove(); markers.splice(idx, 1); updateCounter(); }
  }

  const lista = document.getElementById('moderacao-lista');
  const vazio = document.getElementById('moderacao-vazio');
  animarRemocaoCard(card, lista, vazio);
  atualizarFilaModeracaoBadge();
}

// ============================================================
// 9e. MEUS ENVIOS — ESTADO E CONTAGEM DE OCORRÊNCIAS
// ============================================================
// meusEnvios: array de objetos { id, categoria, descricao, lat, lng,
//   fotoStatus: null|'analise'|'aprovada'|'reprovada_dados'|'reprovada_qualidade'|'reprovada_impr',
//   pontoAtivo: true|false }
let meusEnvios = JSON.parse(localStorage.getItem('meus_envios') || '[]');
let ocorrenciasImproprias = parseInt(localStorage.getItem('ocorrencias_improprias') || '0');

function salvarMeusEnvios() {
  localStorage.setItem('meus_envios', JSON.stringify(meusEnvios));
}

function novosStatusNaoVistos() {
  return meusEnvios.filter(e => e.statusNovo).length;
}

function atualizarBadgeGear() {
  const qtd = novosStatusNaoVistos();
  const badge = document.getElementById('badge-gear');
  if (qtd > 0) {
    badge.classList.add('visivel');
    badge.textContent = qtd > 9 ? '9+' : qtd;
    const badgeMenu = document.getElementById('badge-meus-envios');
    badgeMenu.style.display = 'inline-block';
    badgeMenu.textContent   = qtd;
  } else {
    badge.classList.remove('visivel');
    document.getElementById('badge-meus-envios').style.display = 'none';
  }
}

// Ao carregar, busca status atualizado dos envios no Supabase
async function sincronizarMeusEnvios() {
  if (meusEnvios.length === 0) return;
  const ids = meusEnvios.map(e => e.id);
  const { data, error } = await supabaseClient
    .from('registros').select('id, foto_status, foto_url').in('id', ids);
  if (error || !data) return;

  let houve_mudanca = false;
  meusEnvios.forEach(envio => {
    const remoto = data.find(r => r.id === envio.id);
    if (!remoto) {
      // ponto foi excluído (removido por conteúdo impróprio ou pelo próprio usuário)
      if (envio.pontoAtivo) {
        envio.pontoAtivo = false;
        envio.statusNovo = true;
        houve_mudanca = true;
      }
      return;
    }
    const novoStatus = remoto.foto_status || null;
    if (novoStatus !== envio.fotoStatus) {
      envio.fotoStatusAnterior = envio.fotoStatus;
      envio.fotoStatus = novoStatus;
      envio.statusNovo = true;
      houve_mudanca = true;
    }
  });
  if (houve_mudanca) {
    salvarMeusEnvios();
    atualizarBadgeGear();
  }
}

function renderizarMeusEnvios() {
  const lista  = document.getElementById('meus-envios-lista');
  const vazio  = document.getElementById('meus-envios-vazio');
  const aviso  = document.getElementById('meus-envios-aviso');
  lista.innerHTML = '';

  // Aviso de ocorrências impróprias
  if (ocorrenciasImproprias >= 1) {
    const faltam = 5 - ocorrenciasImproprias;
    aviso.style.display = 'block';
    if (faltam > 0) {
      aviso.textContent = `⚠ Uma foto sua foi removida por conteúdo incompatível. `
        + `Mais ${faltam} ocorrência${faltam > 1 ? 's' : ''} resultará em banimento da plataforma.`;
    } else {
      aviso.textContent = `⚠ Sua conta foi suspensa por envio repetido de conteúdo incompatível.`;
    }
  } else {
    aviso.style.display = 'none';
  }

  if (meusEnvios.length === 0) {
    vazio.style.display = 'block';
    return;
  }
  vazio.style.display = 'none';

  // Marca todos como vistos ao renderizar
  let houve = false;
  meusEnvios.forEach(e => { if (e.statusNovo) { e.statusNovo = false; houve = true; } });
  if (houve) { salvarMeusEnvios(); atualizarBadgeGear(); }

  meusEnvios.forEach(envio => {
    const card = document.createElement('div');
    const removido = !envio.pontoAtivo;
    card.className = 'envio-card' + (removido ? ' removido' : '');

    // Status do ponto
    const pilulaPonto = removido
      ? `<span class="envio-status-pill removido">removido</span>`
      : `<span class="envio-status-pill ativo">no mapa</span>`;

    // Status da foto
    let fotoHtml = '';
    const fs = envio.fotoStatus;
    if (!envio.temFoto) {
      fotoHtml = '';
    } else if (!fs || fs === 'analise') {
      fotoHtml = `<div class="envio-foto-status analise">⏳ Foto em análise</div>`;
    } else if (fs === 'aprovada') {
      fotoHtml = `<div class="envio-foto-status aprovada">✓ Foto aprovada e visível</div>`;
    } else if (fs === 'reprovada_dados') {
      fotoHtml = `<div class="envio-foto-status reprovada">✕ Foto removida · dados pessoais</div>`;
    } else if (fs === 'reprovada_qualidade') {
      fotoHtml = `<div class="envio-foto-status reprovada">✕ Foto removida · qualidade insuficiente
        <button class="envio-reenviar" onclick="abrirReenvioFoto('${envio.id}')">Reenviar</button>
      </div>`;
    } else if (fs === 'reprovada_impr') {
      fotoHtml = `<div class="envio-foto-status reprovada">✕ Foto e ponto removidos · conteúdo incompatível</div>`;
    }

    // Link ver no mapa (só se ponto ativo)
    const verMapa = !removido
      ? `<span class="envio-ver-mapa">🔍 ver no mapa</span>`
      : '';

    card.innerHTML = `
      <div class="envio-card-titulo">
        <span>${catLabels[envio.categoria] || envio.categoria}${envio.descricao ? ' — ' + envio.descricao.substring(0,30) + (envio.descricao.length > 30 ? '…' : '') : ''}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          ${pilulaPonto}
          <button class="btn-remover-envio" title="Remover da lista" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:16px;line-height:1;padding:0 2px;flex-shrink:0;transition:color 0.15s;" onmouseover="this.style.color='#d61616'" onmouseout="this.style.color='var(--text-secondary)'">×</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        ${fotoHtml}
        ${verMapa}
      </div>
    `;

    card.querySelector('.btn-remover-envio').addEventListener('click', (e) => {
      e.stopPropagation();
      meusEnvios = meusEnvios.filter(e2 => e2.id !== envio.id);
      salvarMeusEnvios();
      atualizarBadgeGear();
      card.style.transition = 'opacity 0.2s';
      card.style.opacity = '0';
      setTimeout(() => {
        card.remove();
        if (lista.children.length === 0) {
          document.getElementById('meus-envios-vazio').style.display = 'block';
        }
      }, 200);
    });

    if (!removido) {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('envio-reenviar') || e.target.classList.contains('btn-remover-envio')) return;
        document.getElementById('modal-meus-envios').classList.remove('open');
        gearDropdown.style.display = 'none';
        map.setView([envio.lat, envio.lng], 17, { animate: true });
        const item = markers.find(m => m.id === envio.id);
        if (item) { item.marker.openPopup(); }
      });
    }

    lista.appendChild(card);
  });
}

window.abrirReenvioFoto = function(id) {
  document.getElementById('modal-meus-envios').classList.remove('open');
  alert('Funcionalidade de reenvio de foto: abre o ponto no mapa para nova foto.'); // placeholder
};

// ============================================================
// 10. CAMPOS EXTRAS DE ALAGAMENTO
// ============================================================
document.getElementById('cat-select').addEventListener('change', function() {
  const campos = document.getElementById('alagamento-fields');
  if (this.value === 'alagamento') {
    campos.style.display = 'block';
  } else {
    campos.style.display = 'none';
    limparCamposAlagamento();
  }
});

function setupSelectOutro(selectId, inputId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  sel.addEventListener('change', function() {
    if (this.value === 'outro') { inp.style.display = 'block'; inp.focus(); }
    else { inp.style.display = 'none'; inp.value = ''; }
  });
}

setupSelectOutro('select-frequencia',    'frequencia-outro');
setupSelectOutro('select-caracteristica','caracteristica-outro');

// Checkbox "Não lembro a data" — desativa/limpa o campo de data
document.getElementById('alag-data-nao-lembro').addEventListener('change', function() {
  const campoData = document.getElementById('alag-data');
  if (this.checked) {
    campoData.value = '';
    campoData.disabled = true;
  } else {
    campoData.disabled = false;
    campoData.value = getDataBrasiliaISO();
  }
});

// Checkbox "outro" de danos — mostra/esconde campo de texto
document.getElementById('dano-outro-check').addEventListener('change', function() {
  const inp = document.getElementById('origem-outro');
  if (this.checked) { inp.style.display = 'block'; inp.focus(); }
  else { inp.style.display = 'none'; inp.value = ''; }
});

function limparCamposAlagamento() {
  const campoData = document.getElementById('alag-data');
  const naoLembro = document.getElementById('alag-data-nao-lembro');
  naoLembro.checked = true;
  campoData.disabled = true;
  campoData.max = getDataBrasiliaISO();
  campoData.value = '';
  ['select-frequencia', 'select-caracteristica'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['frequencia-outro', 'caracteristica-outro', 'origem-outro'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.style.display = 'none';
  });
  // Desmarca todos os checkboxes de danos
  document.querySelectorAll('#checkboxes-danos input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
}

// Retorna a data atual no horário de Brasília no formato 'YYYY-MM-DD'
function getDataBrasiliaISO() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const ano = partes.find(p => p.type === 'year').value;
  const mes = partes.find(p => p.type === 'month').value;
  const dia = partes.find(p => p.type === 'day').value;
  return `${ano}-${mes}-${dia}`;
}

// Converte data 'YYYY-MM-DD' para 'DD/MM/YYYY' (mantém texto livre como 'Não lembro')
function formatarDataBR(dataStr) {
  if (!dataStr) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) return dataStr;
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

function lerCampoAlagamento(selectId, outroId) {
  const sel = document.getElementById(selectId);
  if (!sel.value) return null;
  if (sel.value === 'outro') {
    const texto = document.getElementById(outroId).value.trim();
    return texto ? `Outro: ${texto}` : 'Outro';
  }
  return sel.value;
}

// Lê os checkboxes de danos e retorna um array com os selecionados
function lerDanosAlagamento() {
  const marcados = [];
  document.querySelectorAll('#checkboxes-danos input[type="checkbox"]:checked').forEach(cb => {
    if (cb.value === 'outro') {
      const texto = document.getElementById('origem-outro').value.trim();
      marcados.push(texto ? `Outro: ${texto}` : 'Outro');
    } else {
      marcados.push(cb.value);
    }
  });
  return marcados.length > 0 ? marcados : null;
}

// ============================================================
// 11. ADICIONAR MARCADOR
// ============================================================
function adicionarMarcador({ id, lat, lng, categoria, descricao, autor_token,
    alag_intensidade, alag_caracteristica, alag_danos, alag_data, denuncias, denunciasTokens,
    foto_url, foto_status }) {

  const tokens = Array.isArray(denunciasTokens) ? denunciasTokens
               : Array.isArray(denuncias)        ? denuncias
               : [];
  const qtd = tokens.length;
  const denunciado   = qtd > 0;
  const fotoPendente = foto_status === 'analise';
  const cor = catColors[categoria] || '#999';

  const marker = L.marker([lat, lng], { icon: makeIcon(cor, denunciado, fotoPendente) });

  marker._registroData = {
    id, lat, lng, categoria, descricao, autor_token,
    alag_intensidade, alag_caracteristica, alag_danos, alag_data,
    denuncias: qtd, denunciasTokens: tokens, denunciado,
    foto_url: foto_url || null, foto_status: foto_status || null
  };
  marker.bindPopup(montarPopup(marker._registroData), popupOptions());

  clusterGroup.addLayer(marker);
  markers.push({ marker, cat: categoria, id, autorToken: autor_token, denunciado, fotoPendente });
  updateCounter();
}

// ============================================================
// 11.1 OPÇÕES DO POPUP — evita que o popup fique maior que a tela
// ============================================================
// Em telas pequenas, um relato longo (descrição + foto + botões) pode ficar
// mais alto que a área visível do mapa. Quando isso acontece, o Leaflet não
// consegue "autoPan" o popup inteiro para dentro da tela e a parte de cima
// (com o botão de fechar "X") some atrás do cabeçalho.
//
// A solução: limitar a altura do popup ao espaço realmente disponível no
// mapa e deixar o CONTEÚDO rolar internamente (scroll). O cabeçalho do
// popup e o botão "X" ficam fora dessa área de rolagem, então nunca somem.
function popupOptions() {
  const mapEl = document.getElementById('map-container');
  const alturaDisponivel = mapEl ? mapEl.clientHeight : window.innerHeight;

  // Reserva uma margem de segurança (attribution do Leaflet, bordas, etc.)
  const maxHeight = Math.max(160, Math.round(alturaDisponivel * 0.75) - 40);

  return {
    maxWidth: 260,
    maxHeight,               // ativa o scroll interno nativo do Leaflet
    autoPan: true,
    autoPanPadding: [16, 16],
    keepInView: true
  };
}

// ============================================================
// 12. MONTAR POPUP
// ============================================================
function montarPopup(data) {
  const ehAutor = data.autor_token === meuToken;

  const btnExcluir = (ehAutor || adminLogado)
    ? `<button onclick="excluirPonto('${data.id}')"
         style="margin-top:8px;padding:3px 10px;background:#e53935;color:white;
                border:none;border-radius:4px;cursor:pointer;font-size:11px;">
         Excluir
       </button>`
    : '';

  const jaDenunciou = Array.isArray(data.denunciasTokens)
    && data.denunciasTokens.includes(meuToken);

  const btnDenunciar = (!ehAutor && !adminLogado)
    ? (jaDenunciou
        ? `<button onclick="denunciarPonto('${data.id}')"
              style="margin-top:8px;margin-left:4px;padding:3px 10px;
                     background:#e53935;color:white;border:1px solid #e53935;
                     border-radius:4px;font-size:11px;cursor:pointer;">
              ⚑ Denunciado
           </button>`
        : `<button onclick="denunciarPonto('${data.id}')"
              style="margin-top:8px;margin-left:4px;padding:3px 10px;
                     background:white;color:#e53935;border:1px solid #e53935;
                     border-radius:4px;cursor:pointer;font-size:11px;">
              ⚑ Denunciar
           </button>`)
    : '';

  const btnIgnorarDenuncia = (adminLogado && data.denunciado)
    ? `<button onclick="ignorarDenuncias('${data.id}')"
          style="margin-top:8px;margin-left:4px;padding:3px 10px;
                 background:white;color:#888;border:1px solid #ccc;
                 border-radius:4px;cursor:pointer;font-size:11px;">
          ✕ Ignorar denúncias
       </button>`
    : '';

  const badgeDenuncias = (adminLogado && data.denunciado)
    ? `<div style="margin-top:6px;">
         <span style="display:inline-block;padding:2px 8px;
           background:#e53935;color:white;border-radius:10px;font-size:10px;font-weight:600;">
           ⚑ ${data.denuncias} denúncia${data.denuncias > 1 ? 's' : ''}
         </span>
       </div>`
    : '';

  let extras = '';
  if (data.categoria === 'alagamento') {
    if (data.alag_data) extras += `<p style="margin:4px 0 0"><strong>Quando ocorreu:</strong> ${formatarDataBR(data.alag_data)}</p>`;
    if (data.alag_intensidade)    extras += `<p style="margin:4px 0 0"><strong>Intensidade:</strong> ${data.alag_intensidade}</p>`;
    if (data.alag_caracteristica) extras += `<p style="margin:4px 0 0"><strong>Características:</strong> ${data.alag_caracteristica}</p>`;
    if (data.alag_danos) {
      let danos = data.alag_danos;
      if (typeof danos === 'string') {
        try { danos = JSON.parse(danos); } catch (e) { danos = [danos]; }
      }
      if (!Array.isArray(danos)) danos = [danos];
      if (danos.length > 0) {
        extras += `<p style="margin:4px 0 0"><strong>Danos:</strong> ${danos.join(', ')}</p>`;
      }
    }
  }

  return `
    <strong>${catLabels[data.categoria] || data.categoria}</strong>
    ${extras}
    ${data.descricao ? `<p style="margin:4px 0 0">${data.descricao}</p>` : ''}
    ${data.foto_url && data.foto_status === 'aprovada'
      ? `<img src="${data.foto_url}" style="margin-top:8px;width:100%;max-height:120px;object-fit:cover;border-radius:5px;display:block;" />`
      : ''}
    ${adminLogado && data.foto_status === 'analise'
      ? `<div style="margin-top:6px;"><span style="display:inline-block;padding:2px 8px;background:#d69600;color:white;border-radius:10px;font-size:10px;font-weight:600;">📷 Foto aguardando aprovação</span></div>`
      : ''}
    ${badgeDenuncias}
    <div style="display:flex;flex-wrap:wrap;gap:0;">${btnExcluir}${btnDenunciar}${btnIgnorarDenuncia}</div>
  `;
}

// ============================================================
// 13. ATUALIZAR TODOS OS POPUPS (após login/logout admin)
// ============================================================
function atualizarTodosPopups() {
  markers.forEach(({ marker }) => {
    if (!marker._registroData) return;
    const d = marker._registroData;
    const cor = catColors[d.categoria] || '#999';
    const fotoPendente = d.foto_status === 'analise';
    marker.setIcon(makeIcon(cor, d.denunciado, fotoPendente));
    marker.setPopupContent(montarPopup(d));
  });
}

// ============================================================
// 14. EXCLUIR PONTO
// ============================================================
window.excluirPonto = async function(id) {
  if (!confirm('Excluir este registro?')) return;

  const { error } = await supabaseClient.from('registros').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }

  const idx = markers.findIndex(m => m.id === id);
  if (idx !== -1) {
    clusterGroup.removeLayer(markers[idx].marker);
    markers.splice(idx, 1);
    updateCounter();
  }
};

// ============================================================
// 15. DENUNCIAR PONTO
// ============================================================
window.denunciarPonto = async function(id) {
  const item = markers.find(m => m.id === id);
  if (!item) return;

  const { data: registro, error: errGet } = await supabaseClient
    .from('registros').select('denuncias').eq('id', id).single();

  if (errGet) { alert('Erro ao buscar registro.'); return; }

  const atual = Array.isArray(registro.denuncias) ? registro.denuncias : [];
  const jaDenunciou = atual.includes(meuToken);

  // Toggle: remove se já denunciou, adiciona se não
  const novos = jaDenunciou
    ? atual.filter(t => t !== meuToken)
    : [...atual, meuToken];

  const { error: errUpd } = await supabaseClient
    .from('registros').update({ denuncias: novos }).eq('id', id);

  if (errUpd) { alert('Erro ao atualizar denúncia.'); return; }

  // Atualiza estado local e UI
  const d = item.marker._registroData;
  d.denuncias = novos.length;
  d.denunciasTokens = novos;
  d.denunciado = novos.length > 0;
  item.denunciado = d.denunciado;

  const cor = catColors[d.categoria] || '#999';
  item.marker.setIcon(makeIcon(cor, adminLogado && d.denunciado, d.foto_status === 'analise'));
  item.marker.setPopupContent(montarPopup(d));
  item.marker.closePopup();
  item.marker.openPopup();
};

// ============================================================
// 15b. ADMIN — IGNORAR DENÚNCIAS
// ============================================================
window.ignorarDenuncias = async function(id) {
  const item = markers.find(m => m.id === id);
  if (!item) return;

  const { error } = await supabaseClient
    .from('registros').update({ denuncias: [] }).eq('id', id);

  if (error) { alert('Erro ao ignorar denúncias.'); return; }

  const d = item.marker._registroData;
  d.denuncias = 0;
  d.denunciasTokens = [];
  d.denunciado = false;
  item.denunciado = false;

  const cor = catColors[d.categoria] || '#999';
  item.marker.setIcon(makeIcon(cor, false, d.foto_status === 'analise'));
  item.marker.setPopupContent(montarPopup(d));
  item.marker.closePopup();
  item.marker.openPopup();
};

// ============================================================
// 16. CARREGAR PONTOS DO SUPABASE
// ============================================================
async function carregarRegistros() {
  const { data, error } = await supabaseClient
    .from('registros').select('*').order('criado_em', { ascending: true });

  if (error) { console.error('Erro ao carregar registros:', error.message); return; }

  data.forEach(r => {
    const tokens = Array.isArray(r.denuncias) ? r.denuncias : [];
    adicionarMarcador({ ...r, denuncias: tokens, denunciasTokens: tokens });
  });
}

// ============================================================
// 17. CLICAR NO MAPA → ABRIR MODAL
// ============================================================
map.on('click', function(e) {
  pendingLatLng = e.latlng;
  document.getElementById('cat-select').value = '';
  document.getElementById('desc-input').value = '';
  document.getElementById('alagamento-fields').style.display = 'none';
  limparCamposAlagamento();
  limparFoto();
  document.getElementById('modal').classList.add('open');
});

document.getElementById('btn-cancel').onclick = () =>
  document.getElementById('modal').classList.remove('open');

// ============================================================
// 18. SALVAR NOVO PONTO
// ============================================================
document.getElementById('btn-save').onclick = async function() {
  const cat  = document.getElementById('cat-select').value;
  const desc = document.getElementById('desc-input').value.trim();
  if (!cat) return alert('Selecione uma categoria!');

  if (ocorrenciasImproprias >= 5) {
    alert('Sua conta está suspensa por envio repetido de conteúdo incompatível.');
    return;
  }

  this.disabled = true;
  this.textContent = 'Salvando...';

  const novoRegistro = {
    lat: pendingLatLng.lat, lng: pendingLatLng.lng,
    categoria: cat, descricao: desc || null,
    autor_token: meuToken, denuncias: [],
    foto_status: null, foto_url: null
  };

  if (cat === 'alagamento') {
    novoRegistro.alag_data           = document.getElementById('alag-data-nao-lembro').checked
                                          ? 'Não lembro'
                                          : (document.getElementById('alag-data').value || null);
    novoRegistro.alag_intensidade    = lerCampoAlagamento('select-frequencia',    'frequencia-outro');
    novoRegistro.alag_caracteristica = lerCampoAlagamento('select-caracteristica','caracteristica-outro');
    novoRegistro.alag_danos          = lerDanosAlagamento();
  }

  const { data, error } = await supabaseClient
    .from('registros').insert(novoRegistro).select().single();

  if (error) {
    this.disabled = false;
    this.textContent = 'Salvar';
    alert('Erro ao salvar: ' + error.message);
    return;
  }

  let temFoto = false;
  if (fotoArquivo) {
    temFoto = true;
    this.textContent = 'Enviando foto...';
    const ext  = fotoArquivo.name.split('.').pop();
    const path = `fotos/${data.id}.${ext}`;
    const { error: errUp } = await supabaseClient.storage
      .from('registros-fotos').upload(path, fotoArquivo, { upsert: true });
    if (errUp) {
      console.error('ERRO upload foto:', errUp.message);
      // Mostra erro visível para diagnóstico
      alert('Ponto salvo, mas a foto não foi enviada.\nErro: ' + errUp.message + '\n\nVerifique se o bucket "registros-fotos" existe no Supabase Storage.');
    } else {
      const { data: urlData } = supabaseClient.storage
        .from('registros-fotos').getPublicUrl(path);
      const { error: errUpdate } = await supabaseClient.from('registros').update({
        foto_url: urlData.publicUrl,
        foto_status: 'analise'
      }).eq('id', data.id);
      if (errUpdate) {
        console.error('ERRO ao salvar URL da foto:', errUpdate.message);
      } else {
        data.foto_status = 'analise';
        data.foto_url    = urlData.publicUrl;
      }
    }
  }

  this.disabled = false;
  this.textContent = 'Salvar';

  meusEnvios.unshift({
    id: data.id,
    categoria: cat,
    descricao: desc || null,
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
    temFoto,
    fotoStatus: data.foto_status || null,
    pontoAtivo: true,
    statusNovo: false
  });
  salvarMeusEnvios();
  atualizarBadgeGear();

  adicionarMarcador({ ...data, denuncias: [], denunciasTokens: [] });
  document.getElementById('modal').classList.remove('open');
  limparFoto();
};

// ============================================================
// 19. FILTROS
// ============================================================
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    filtroAtivo = this.dataset.cat;

    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.remove('active');
      b.style.background = '';
      b.style.color = '';
    });
    this.classList.add('active');
    this.style.background = filtroAtivo === 'todos' ? '#d61616' : catColors[filtroAtivo];
    this.style.color = 'white';

    clusterGroup.clearLayers();
    markers.forEach(m => {
      if (filtroAtivo === 'todos' || m.cat === filtroAtivo) {
        clusterGroup.addLayer(m.marker);
      }
    });

    // Legenda só aparece quando o filtro "Todos" está ativo e fora do modo mapa de calor
    legendDiv.style.display = (filtroAtivo === 'todos' && !heatAtivo) ? '' : 'none';

    // Contador reflete apenas os registros da categoria filtrada (e sincroniza o heatmap, se ativo)
    updateCounter();
  });
});

// ============================================================
// 20. ENGRENAGEM — DROPDOWN COM LOGIN, SUGESTÕES E TEMA
// ============================================================
const gearBtn      = document.getElementById('btn-admin-login');
const gearDropdown = document.getElementById('gear-dropdown');

gearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = gearDropdown.style.display === 'block';
  gearDropdown.style.display = isOpen ? 'none' : 'block';
});

gearDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
});

document.addEventListener('click', () => {
  gearDropdown.style.display = 'none';
});

document.getElementById('btn-menu-login').addEventListener('click', () => {
  gearDropdown.style.display = 'none';
  document.getElementById('admin-erro').style.display = 'none';
  document.getElementById('admin-email').value = '';
  document.getElementById('admin-senha').value = '';
  document.getElementById('modal-admin').classList.add('open');
});

document.getElementById('btn-menu-sugestoes').addEventListener('click', () => {
  gearDropdown.style.display = 'none';
  document.getElementById('sugestao-texto').value = '';
  document.getElementById('sugestao-contato').value = '';
  document.getElementById('sugestao-erro').style.display = 'none';
  document.getElementById('sugestao-ok').style.display = 'none';
  document.getElementById('modal-sugestoes').classList.add('open');
});

document.getElementById('btn-menu-moderacao').addEventListener('click', () => {
  gearDropdown.style.display = 'none';
  carregarFilaModeracao();
  document.getElementById('modal-moderacao').classList.add('open');
});

document.getElementById('btn-moderacao-fechar').addEventListener('click', () => {
  document.getElementById('modal-moderacao').classList.remove('open');
});

document.getElementById('modal-moderacao').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});

document.getElementById('btn-menu-meus-envios').addEventListener('click', () => {
  gearDropdown.style.display = 'none';
  renderizarMeusEnvios();
  document.getElementById('modal-meus-envios').classList.add('open');
});

document.getElementById('btn-meus-envios-fechar').addEventListener('click', () => {
  document.getElementById('modal-meus-envios').classList.remove('open');
});

document.getElementById('modal-meus-envios').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});

// ============================================================
// 20b. TOGGLE DE TEMA CLARO / ESCURO
// ============================================================
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem('tema', tema);

  const labelEl = document.getElementById('tema-label-texto');
  if (tema === 'dark') {
    labelEl.textContent = 'Tema claro';
  } else {
    labelEl.textContent = 'Tema escuro';
  }
}

// Inicializa o label do botão de acordo com o tema atual
aplicarTema(localStorage.getItem('tema') || 'light');

document.getElementById('btn-menu-tema').addEventListener('click', () => {
  const temaAtual = document.documentElement.getAttribute('data-theme');
  const novoTema  = temaAtual === 'dark' ? 'light' : 'dark';
  aplicarTema(novoTema);
  // Não fecha o dropdown — permite ver a mudança em tempo real
});

// ============================================================
// 21. SUGESTÕES
// ============================================================
document.getElementById('btn-sugestao-cancel').addEventListener('click', () =>
  document.getElementById('modal-sugestoes').classList.remove('open'));

document.getElementById('btn-sugestao-enviar').addEventListener('click', async function() {
  const texto   = document.getElementById('sugestao-texto').value.trim();
  const contato = document.getElementById('sugestao-contato').value.trim();
  const erroEl  = document.getElementById('sugestao-erro');
  const okEl    = document.getElementById('sugestao-ok');

  erroEl.style.display = 'none';
  okEl.style.display   = 'none';

  if (!texto) {
    erroEl.textContent = 'Por favor, escreva sua sugestão antes de enviar.';
    erroEl.style.display = 'block';
    return;
  }

  this.disabled = true;
  this.textContent = 'Enviando...';

  const { error } = await supabaseClient
    .from('sugestoes')
    .insert({ texto, contato: contato || null });

  this.disabled = false;
  this.textContent = 'Enviar';

  if (error) {
    erroEl.textContent = 'Erro ao enviar. Tente novamente.';
    erroEl.style.display = 'block';
    return;
  }

  okEl.style.display = 'block';
  document.getElementById('sugestao-texto').value = '';
  document.getElementById('sugestao-contato').value = '';
  setTimeout(() => document.getElementById('modal-sugestoes').classList.remove('open'), 2000);
});

document.getElementById('btn-admin-cancel').addEventListener('click', () =>
  document.getElementById('modal-admin').classList.remove('open'));

// ============================================================
// 22. ADMIN — LOGIN
// ============================================================
document.getElementById('btn-admin-entrar').addEventListener('click', async function() {
  const email = document.getElementById('admin-email').value.trim();
  const senha = document.getElementById('admin-senha').value;
  const erroEl = document.getElementById('admin-erro');

  if (!email || !senha) {
    erroEl.textContent = 'Preencha email e senha.';
    erroEl.style.display = 'block';
    return;
  }

  this.disabled = true; this.textContent = 'Entrando...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

  this.disabled = false; this.textContent = 'Entrar';

  if (error) {
    erroEl.textContent = 'Email ou senha incorretos.';
    erroEl.style.display = 'block';
    return;
  }

  adminLogado = true;
  document.getElementById('modal-admin').classList.remove('open');
  // engrenagem permanece visível — só esconde o item Login e mostra o email+sair dentro do dropdown
  document.getElementById('btn-menu-login').style.display = 'none';
  document.getElementById('dropdown-admin-logado').style.display = 'block';
  document.getElementById('dropdown-admin-email').textContent = data.user.email;
  document.getElementById('gear-admin-section').style.display = 'block';
  atualizarFilaModeracaoBadge();
  atualizarTodosPopups();
});

// ============================================================
// 23. ADMIN — LOGOUT
// ============================================================
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  adminLogado = false;
  document.getElementById('btn-menu-login').style.display = 'block';
  document.getElementById('dropdown-admin-logado').style.display = 'none';
  document.getElementById('gear-admin-section').style.display = 'none';
  atualizarTodosPopups();
});

// ============================================================
// 24. VERIFICAR SESSÃO SALVA
// ============================================================
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) {
    adminLogado = true;
    document.getElementById('btn-menu-login').style.display = 'none';
    document.getElementById('dropdown-admin-logado').style.display = 'block';
    document.getElementById('dropdown-admin-email').textContent = data.session.user.email;
    document.getElementById('gear-admin-section').style.display = 'block';
    atualizarFilaModeracaoBadge();
  }
});

// ============================================================
// 25. INICIAR
// ============================================================
carregarRegistros();
sincronizarMeusEnvios();
atualizarBadgeGear();

// Escuta mudanças de foto_status em tempo real para pontos do usuário
supabaseClient
  .channel('foto-status-updates')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registros' }, (payload) => {
    const novo = payload.new;
    const envio = meusEnvios.find(e => e.id === novo.id);
    if (!envio) return;

    const statusAnterior = envio.fotoStatus;
    const statusNovo     = novo.foto_status || null;

    if (statusNovo === statusAnterior) return;

    envio.fotoStatus = statusNovo;
    envio.statusNovo = true;

    // Conteúdo impróprio: ponto removido, registra ocorrência
    if (statusNovo === 'reprovada_impr') {
      envio.pontoAtivo = false;
      ocorrenciasImproprias++;
      localStorage.setItem('ocorrencias_improprias', ocorrenciasImproprias);
    }

    salvarMeusEnvios();
    atualizarBadgeGear();
  })
  .subscribe();