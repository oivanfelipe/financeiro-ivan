/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Orçamento Ivan — backend (Google Apps Script)
 *  Planilha: "Orçamento Ivan Felipe - App"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  REGRAS DE OURO DESTE ARQUIVO:
 *
 *  1. Lançamento de gasto SEMPRE SOMA ao valor que já está na célula.
 *     Nunca sobrescreve (a não ser que o app peça modo=substituir).
 *
 *  2. Gasto SÓ pode ser gravado na coluna "Custo".
 *     A coluna "Orçamento" é o previsto do mês e NUNCA é tocada por
 *     lançamento. Existe uma trava explícita para isso em gravarCusto_().
 *
 *  3. As colunas são descobertas pelo CABEÇALHO da aba, não por posição fixa.
 *     Se a planilha ganhar/perder uma coluna, o script continua acertando.
 *
 *  Layout esperado (aba de mês):
 *    A = Detalhes da despesa | B = Data (vencimento) | C = Categoria
 *    D = Orçamento           | E = Custo             | F = Data da transação
 *    G = Observações
 *
 *  ── Como publicar ──────────────────────────────────────────────────────────
 *    Implantar → Gerenciar implantações → (ícone lápis) → Versão: Nova versão
 *    → Implantar.  Isso mantém a MESMA URL /exec que o app já usa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

var SHEET_ID = '1UASGHz5Q9VVhgugUwGVr_hR1trnyn6d1LMLsteUKqvA';

/** Posições de fallback, caso o cabeçalho não seja reconhecido. */
var COLUNAS_PADRAO = {
  nome: 1, vencimento: 2, categoria: 3, orcamento: 4,
  custo: 5, dataTransacao: 6, observacoes: 7
};

var MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
             'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];


/* ═══════════════════════════════════════════════════════════════════════════
   ROTEADOR HTTP
   ═══════════════════════════════════════════════════════════════════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var acao = normalizar_(p.action || 'read');
  var saida;

  try {
    if (acao === 'getsheets' || acao === 'abas') {
      saida = { ok: true, sheets: listarAbas_(), mesAtual: nomeDaAbaDoMes_() };

    } else if (acao === 'read' || acao === 'ler') {
      saida = lerAba_(p.sheet);
      saida.ok = true;

    } else if (acao === 'lancar' || acao === 'pagar' || acao === 'write') {
      saida = comTrava_(function () { return lancarCusto_(p); });

    } else if (acao === 'inserir' || acao === 'append') {
      saida = comTrava_(function () { return inserirLinha_(p); });

    } else if (acao === 'ping') {
      saida = { ok: true, versao: versaoDoScript_(), hora: new Date().toISOString() };

    } else {
      saida = { ok: false, error: 'Ação desconhecida: ' + acao };
    }
  } catch (err) {
    saida = { ok: false, error: String((err && err.message) || err) };
  }

  if (saida && saida.ok !== false) saida.versao = versaoDoScript_();
  return responder_(saida, p.callback);
}

function doPost(e) {
  return doGet(e);
}

/** Identifica a versão do backend para o app avisar se estiver desatualizado. */
function versaoDoScript_() {
  return '2026.08-somar';
}

function responder_(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/** Serializa escritas para dois lançamentos simultâneos não se perderem. */
function comTrava_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return { ok: false, error: 'A planilha está ocupada. Tente de novo em alguns segundos.' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS
   ═══════════════════════════════════════════════════════════════════════════ */

function normalizar_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Aceita 1234.56, "1.234,56", "R$ 1.234,56" e devolve número (ou null). */
function parseValor_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (Object.prototype.toString.call(v) === '[object Date]') return null;

  var s = String(v).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function colunaLetra_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m - 1) / 26);
  }
  return s;
}

function larguraDe_(sheet) {
  return Math.min(Math.max(sheet.getLastColumn(), 7), sheet.getMaxColumns());
}


/* ═══════════════════════════════════════════════════════════════════════════
   ABAS E COLUNAS
   ═══════════════════════════════════════════════════════════════════════════ */

function listarAbas_() {
  return SpreadsheetApp.openById(SHEET_ID).getSheets().map(function (s) {
    return s.getName();
  });
}

/** Nome da aba correspondente ao mês corrente ("8 - Agosto", "Agosto", ...). */
function nomeDaAbaDoMes_() {
  var abas = listarAbas_();
  var mes  = new Date().getMonth();          // 0-11
  var num  = mes + 1;
  var nome = MESES[mes];

  for (var i = 0; i < abas.length; i++) {
    var norm = normalizar_(abas[i]);
    if (norm.indexOf(nome) >= 0) return abas[i];
    if (parseInt(String(abas[i]).trim(), 10) === num) return abas[i];
  }
  return abas.length ? abas[0] : '';
}

function pegarAba_(nome) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var abas = ss.getSheets();

  if (!nome) {
    var doMes = nomeDaAbaDoMes_();
    nome = doMes || (abas.length ? abas[0].getName() : '');
  }

  var alvo = normalizar_(nome);
  for (var i = 0; i < abas.length; i++) {
    if (normalizar_(abas[i].getName()) === alvo) return abas[i];
  }
  for (var j = 0; j < abas.length; j++) {
    if (normalizar_(abas[j].getName()).indexOf(alvo) >= 0) return abas[j];
  }
  throw new Error('Aba não encontrada: "' + nome + '". Disponíveis: ' + listarAbas_().join(', '));
}

/**
 * Descobre as colunas pelo cabeçalho da linha 1.
 * "Data da transação" é resolvida ANTES de "Data" para as duas não colidirem.
 */
function mapearColunas_(sheet) {
  var largura = larguraDe_(sheet);
  var header = sheet.getRange(1, 1, 1, largura).getDisplayValues()[0].map(normalizar_);

  function achar(teste) {
    for (var i = 0; i < header.length; i++) {
      if (header[i] && teste(header[i])) return i + 1;
    }
    return 0;
  }

  var iTransacao = achar(function (h) { return h.indexOf('transac') >= 0; });

  var cols = {
    nome: achar(function (h) {
      return h.indexOf('detalhe') >= 0 || h.indexOf('despesa') >= 0 || h === 'item';
    }),
    vencimento: achar(function (h) {
      return h === 'data' || h.indexOf('vencimento') >= 0;
    }),
    categoria: achar(function (h) { return h.indexOf('categ') >= 0; }),
    orcamento: achar(function (h) {
      return h.indexOf('orcamento') >= 0 || h.indexOf('previsto') >= 0 || h.indexOf('budget') >= 0;
    }),
    custo: achar(function (h) {
      return h.indexOf('custo') >= 0 || h.indexOf('gasto') >= 0 || h.indexOf('realizado') >= 0;
    }),
    dataTransacao: iTransacao,
    observacoes: achar(function (h) { return h.indexOf('observ') >= 0; })
  };

  Object.keys(COLUNAS_PADRAO).forEach(function (k) {
    if (!cols[k]) cols[k] = COLUNAS_PADRAO[k];
  });

  // Trava: Custo jamais pode apontar para a mesma coluna do Orçamento.
  if (cols.custo === cols.orcamento) cols.custo = cols.orcamento + 1;

  return cols;
}


/* ═══════════════════════════════════════════════════════════════════════════
   LEITURA
   ═══════════════════════════════════════════════════════════════════════════ */

function lerAba_(nomeAba) {
  var sheet = pegarAba_(nomeAba);
  var cols  = mapearColunas_(sheet);
  var ultima = sheet.getLastRow();

  var base = {
    sheet: sheet.getName(),
    colunas: {
      nome: colunaLetra_(cols.nome),
      vencimento: colunaLetra_(cols.vencimento),
      categoria: colunaLetra_(cols.categoria),
      orcamento: colunaLetra_(cols.orcamento),
      custo: colunaLetra_(cols.custo),
      dataTransacao: colunaLetra_(cols.dataTransacao),
      observacoes: colunaLetra_(cols.observacoes)
    },
    data: []
  };
  if (ultima < 2) return base;

  var largura = larguraDe_(sheet);
  var range   = sheet.getRange(2, 1, ultima - 1, largura);
  var valores = range.getValues();
  var textos  = range.getDisplayValues();

  for (var i = 0; i < valores.length; i++) {
    var nome = String(valores[i][cols.nome - 1] || '').trim();
    if (!nome) continue;

    base.data.push({
      row: i + 2,
      nome: nome,
      vencimento: String(textos[i][cols.vencimento - 1] || '').trim(),
      categoria: String(valores[i][cols.categoria - 1] || '').trim(),
      orcamento: parseValor_(valores[i][cols.orcamento - 1]),
      custo: parseValor_(valores[i][cols.custo - 1]),
      dataTransacao: String(textos[i][cols.dataTransacao - 1] || '').trim(),
      observacoes: String(valores[i][cols.observacoes - 1] || '').trim()
    });
  }
  return base;
}


/* ═══════════════════════════════════════════════════════════════════════════
   ESCRITA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Localiza a linha do item.
 * Confere primeiro a linha sugerida pelo app (rápido e à prova de itens de
 * nome parecido); se o nome de lá não bater, procura pelo nome.
 */
/**
 * strict=true  → só exact match (usado pelo inserirLinha_ para não confundir
 *                "Barba" com "Barbeiro").
 * strict=false → também aceita substring bidirecional (usado pelo lancarCusto_
 *                para tolerar acentos/espaços ligeiramente diferentes).
 */
function localizarLinha_(sheet, cols, nome, rowSugerida, strict) {
  var ultima = sheet.getLastRow();
  if (ultima < 2) return 0;

  var alvo  = normalizar_(nome);
  var nomes = sheet.getRange(2, cols.nome, ultima - 1, 1).getValues().map(function (r) {
    return normalizar_(r[0]);
  });

  var r = parseInt(rowSugerida, 10);
  if (r >= 2 && r <= ultima && nomes[r - 2] === alvo) return r;

  var i = nomes.indexOf(alvo);
  if (i >= 0) return i + 2;

  if (!strict) {
    for (var j = 0; j < nomes.length; j++) {
      if (nomes[j] && (nomes[j].indexOf(alvo) >= 0 || alvo.indexOf(nomes[j]) >= 0)) return j + 2;
    }
  }
  return 0;
}

/**
 * Grava o custo — ÚNICO ponto do script que escreve valor de gasto.
 * A trava abaixo garante que um gasto nunca caia na coluna de Orçamento.
 */
function gravarCusto_(sheet, cols, linha, total) {
  if (cols.custo === cols.orcamento) {
    throw new Error('Bloqueado: coluna de Custo coincide com a de Orçamento na aba "' +
                    sheet.getName() + '". Confira o cabeçalho da linha 1.');
  }
  sheet.getRange(linha, cols.custo).setValue(total);
}

/**
 * action=lancar — SOMA o valor ao custo já existente na célula.
 * Parâmetros: sheet, nome, value, [row], [date], [modo=somar|substituir]
 */
function lancarCusto_(p) {
  var nome = String(p.nome || '').trim();
  if (!nome) return { ok: false, error: 'Item não informado.' };

  var valor = parseValor_(p.value);
  if (valor === null) return { ok: false, error: 'Valor inválido: ' + p.value };

  var sheet = pegarAba_(p.sheet);
  var cols  = mapearColunas_(sheet);

  var linha = localizarLinha_(sheet, cols, nome, p.row);
  if (!linha) {
    return {
      ok: false, notFound: true,
      error: 'Item "' + nome + '" não existe na aba "' + sheet.getName() + '".'
    };
  }

  var modo     = normalizar_(p.modo || 'somar') === 'substituir' ? 'substituir' : 'somar';
  var anterior = parseValor_(sheet.getRange(linha, cols.custo).getValue()) || 0;
  var total    = (modo === 'substituir') ? valor : anterior + valor;

  gravarCusto_(sheet, cols, linha, total);
  if (p.date) sheet.getRange(linha, cols.dataTransacao).setValue(String(p.date));
  SpreadsheetApp.flush();

  return {
    ok: true,
    sheet: sheet.getName(),
    row: linha,
    nome: String(sheet.getRange(linha, cols.nome).getDisplayValue() || '').trim(),
    categoria: String(sheet.getRange(linha, cols.categoria).getValue() || '').trim(),
    modo: modo,
    anterior: anterior,
    lancado: valor,
    total: total,
    orcamento: parseValor_(sheet.getRange(linha, cols.orcamento).getValue()),
    colunaCusto: colunaLetra_(cols.custo)
  };
}

/**
 * action=inserir — cria uma linha nova (usado pelo "Outros / item livre").
 * Se o item já existir na aba, soma nele em vez de duplicar a linha.
 * Grava o valor SÓ em Custo; Orçamento fica vazio, salvo se enviado de propósito.
 */
function inserirLinha_(p) {
  var nome = String(p.nome || '').trim();
  if (!nome) return { ok: false, error: 'Descrição não informada.' };

  var valor = parseValor_(p.value);
  if (valor === null) return { ok: false, error: 'Valor inválido: ' + p.value };

  var sheet = pegarAba_(p.sheet);
  var cols  = mapearColunas_(sheet);

  var existente = localizarLinha_(sheet, cols, nome, 0, true);
  if (existente) {
    var r = lancarCusto_({
      sheet: sheet.getName(), nome: nome, value: valor,
      row: existente, date: p.date, modo: p.modo
    });
    r.reaproveitou = true;
    return r;
  }

  var linha   = sheet.getLastRow() + 1;
  var largura = larguraDe_(sheet);

  var conteudo = [];
  for (var i = 0; i < largura; i++) conteudo.push('');

  conteudo[cols.nome - 1]      = nome;
  conteudo[cols.categoria - 1] = String(p.categoria || 'Outros').trim();
  conteudo[cols.custo - 1]     = valor;

  var orc = parseValor_(p.orcamento);
  conteudo[cols.orcamento - 1] = (orc === null ? '' : orc);

  if (p.date) conteudo[cols.dataTransacao - 1] = String(p.date);

  var destino = sheet.getRange(linha, 1, 1, largura);
  destino.setValues([conteudo]);

  // Herda a formatação (moeda, fonte) da linha anterior, sem mexer nos valores.
  if (linha > 2) {
    sheet.getRange(linha - 1, 1, 1, largura)
         .copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  SpreadsheetApp.flush();

  return {
    ok: true,
    sheet: sheet.getName(),
    row: linha,
    nome: nome,
    categoria: conteudo[cols.categoria - 1],
    modo: 'nova-linha',
    anterior: 0,
    lancado: valor,
    total: valor,
    orcamento: (orc === null ? null : orc),
    colunaCusto: colunaLetra_(cols.custo)
  };
}


/* ═══════════════════════════════════════════════════════════════════════════
   MANUTENÇÃO — rodar na mão pelo editor do Apps Script
   ═══════════════════════════════════════════════════════════════════════════

   Conserta o estrago deixado pela versão antiga do script:

     1. Cabeçalho vazio / "Column 7" na coluna de vencimento  →  "Data"
     2. Categoria gravada na coluna B (Data)                  →  move para C
     3. Orçamento que é cópia idêntica do Custo nessas linhas →  limpa
     4. Data de transação órfã (linha sem custo nenhum)       →  limpa

   Rode PRIMEIRO simularCorrecaoPlanilha() e leia o log (Ctrl+Enter).
   Só depois rode corrigirPlanilha().
   ═══════════════════════════════════════════════════════════════════════════ */

function simularCorrecaoPlanilha() { return corrigir_(true); }
function corrigirPlanilha()        { return corrigir_(false); }

function ehData_(txt) {
  return /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(String(txt).trim());
}

function ehVencimentoValido_(txt) {
  var s = String(txt).trim();
  return !s || /^autom/i.test(normalizar_(s)) || ehData_(s) || /^\d{1,2}$/.test(s);
}

function corrigir_(dryRun) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var log = [];

  ss.getSheets().forEach(function (sheet) {
    var aba     = sheet.getName();
    var cols    = mapearColunas_(sheet);
    var largura = larguraDe_(sheet);

    // 1. Cabeçalho da coluna de vencimento
    var celulaCab = sheet.getRange(1, cols.vencimento);
    var cab = String(celulaCab.getDisplayValue() || '').trim();
    if (!cab || /^column\s*\d+$/i.test(cab)) {
      log.push('[' + aba + '] cabeçalho ' + colunaLetra_(cols.vencimento) +
               '1: "' + cab + '" → "Data"');
      if (!dryRun) celulaCab.setValue('Data');
    }

    var ultima = sheet.getLastRow();
    if (ultima < 2) return;

    var range   = sheet.getRange(2, 1, ultima - 1, largura);
    var valores = range.getValues();
    var textos  = range.getDisplayValues();

    for (var i = 0; i < valores.length; i++) {
      var rowN = i + 2;
      var nome = String(valores[i][cols.nome - 1] || '').trim();
      if (!nome) continue;

      var cat   = String(valores[i][cols.categoria - 1] || '').trim();
      var venc  = String(textos[i][cols.vencimento - 1] || '').trim();
      var orc   = parseValor_(valores[i][cols.orcamento - 1]);
      var custo = parseValor_(valores[i][cols.custo - 1]);

      // 2. Categoria que caiu na coluna de vencimento
      if (!cat && venc && !ehVencimentoValido_(venc)) {
        log.push('[' + aba + '] L' + rowN + ' "' + nome + '": categoria "' + venc +
                 '" movida de ' + colunaLetra_(cols.vencimento) + ' para ' +
                 colunaLetra_(cols.categoria));
        if (!dryRun) {
          sheet.getRange(rowN, cols.categoria).setValue(venc);
          sheet.getRange(rowN, cols.vencimento).clearContent();
        }

        // 3. Orçamento duplicado a partir do custo, no mesmo lançamento avulso
        if (orc !== null && custo !== null && orc === custo) {
          log.push('[' + aba + '] L' + rowN + ' "' + nome + '": orçamento ' + orc +
                   ' limpo em ' + colunaLetra_(cols.orcamento) + ' (era cópia do custo)');
          if (!dryRun) sheet.getRange(rowN, cols.orcamento).clearContent();
        }
      }

      // 4. Data de transação órfã: linha sem custo nenhum
      if (custo === null) {
        [cols.dataTransacao, cols.observacoes].forEach(function (c) {
          var txt = String(textos[i][c - 1] || '').trim();
          if (txt && ehData_(txt)) {
            log.push('[' + aba + '] L' + rowN + ' "' + nome + '": data órfã "' + txt +
                     '" removida de ' + colunaLetra_(c) + ' (linha sem custo)');
            if (!dryRun) sheet.getRange(rowN, c).clearContent();
          }
        });
      }
    }
  });

  var cabecalho = (dryRun ? '── SIMULAÇÃO (nada foi alterado) ──'
                          : '── CORREÇÕES APLICADAS ──') +
                  ' ' + log.length + ' ajuste(s)';
  var texto = [cabecalho].concat(log.length ? log : ['Nada a corrigir.']).join('\n');
  Logger.log(texto);
  return texto;
}


/* ═══════════════════════════════════════════════════════════════════════════
   AJUSTE DE VALORES PREVISTOS — rodar na mão, uma vez
   ═══════════════════════════════════════════════════════════════════════════

   Divergências de orçamento entre meses, confirmadas pelo Ivan em 14/08/2026.
   A tabela abaixo é a fonte da verdade: para incluir um novo acerto, basta
   acrescentar uma entrada aqui.

   Rode PRIMEIRO simularAjusteValores() e leia o log. Só depois ajustarValores().
   ═══════════════════════════════════════════════════════════════════════════ */

var AJUSTES_PREVISTOS = [
  {
    item: 'Google One',
    abas: ['setembro'],
    orcamentoDe: 12.50,
    orcamentoPara: 25.00,
    motivo: 'Agosto foi pago a R$ 25,00; o 12,50 era o preço antigo do plano'
  },
  {
    item: 'Imposto nota',
    abas: ['setembro', 'outubro', 'novembro', 'dezembro'],
    renomearPara: 'Imposto nota + INSS',
    orcamentoDe: 618.00,
    orcamentoPara: 788.00,
    motivo: 'o INSS (R$ 170,00) continua devido e se perdeu ao copiar o mês'
  }
];

function simularAjusteValores() { return ajustar_(true); }
function ajustarValores()       { return ajustar_(false); }

function mesmoValor_(a, b) {
  return a !== null && b !== null && Math.abs(a - b) < 0.005;
}

function ajustar_(dryRun) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var log = [];

  ss.getSheets().forEach(function (sheet) {
    var aba     = sheet.getName();
    var abaNorm = normalizar_(aba);
    var cols    = mapearColunas_(sheet);

    AJUSTES_PREVISTOS.forEach(function (ajuste) {
      var vale = !ajuste.abas || ajuste.abas.some(function (a) {
        return abaNorm.indexOf(normalizar_(a)) >= 0;
      });
      if (!vale) return;

      var linha = localizarLinha_(sheet, cols, ajuste.item, 0);
      if (!linha) return;

      var orcAtual = parseValor_(sheet.getRange(linha, cols.orcamento).getValue());

      // Trava de idempotência: só mexe se o valor ainda for o antigo.
      // Rodar de novo, ou depois de um acerto manual, não faz nada.
      if (!mesmoValor_(orcAtual, ajuste.orcamentoDe)) {
        if (!mesmoValor_(orcAtual, ajuste.orcamentoPara)) {
          log.push('[' + aba + '] L' + linha + ' "' + ajuste.item + '": PULADO — ' +
                   'orçamento é ' + orcAtual + ', esperava ' + ajuste.orcamentoDe +
                   ' (confira na mão)');
        }
        return;
      }

      log.push('[' + aba + '] L' + linha + ' "' + ajuste.item + '": orçamento ' +
               ajuste.orcamentoDe + ' → ' + ajuste.orcamentoPara + ' (' + ajuste.motivo + ')');
      if (!dryRun) sheet.getRange(linha, cols.orcamento).setValue(ajuste.orcamentoPara);

      // O custo destes meses futuros é um espelho do previsto, preenchido ao
      // copiar a aba. Se ainda for o valor antigo, acompanha o acerto; se for
      // um gasto real já lançado, fica como está.
      var custoAtual = parseValor_(sheet.getRange(linha, cols.custo).getValue());
      if (mesmoValor_(custoAtual, ajuste.orcamentoDe)) {
        log.push('[' + aba + '] L' + linha + ' "' + ajuste.item + '": custo espelhado ' +
                 ajuste.orcamentoDe + ' → ' + ajuste.orcamentoPara);
        if (!dryRun) sheet.getRange(linha, cols.custo).setValue(ajuste.orcamentoPara);
      }

      if (ajuste.renomearPara) {
        var nomeAtual = String(sheet.getRange(linha, cols.nome).getValue() || '').trim();
        if (normalizar_(nomeAtual) !== normalizar_(ajuste.renomearPara)) {
          log.push('[' + aba + '] L' + linha + ': "' + nomeAtual + '" → "' + ajuste.renomearPara + '"');
          if (!dryRun) sheet.getRange(linha, cols.nome).setValue(ajuste.renomearPara);
        }
      }
    });
  });

  if (!dryRun) SpreadsheetApp.flush();

  var cabecalho = (dryRun ? '── SIMULAÇÃO (nada foi alterado) ──'
                          : '── AJUSTES APLICADOS ──') + ' ' + log.length + ' linha(s) de registro';
  var texto = [cabecalho].concat(log.length ? log : ['Nada a ajustar.']).join('\n');
  Logger.log(texto);
  return texto;
}
