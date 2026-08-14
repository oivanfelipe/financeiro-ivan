/* Mock mínimo do SpreadsheetApp para exercitar o Codigo.gs de verdade. */
const fs = require('fs');

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  _cells(fn) {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const linha = [];
      for (let j = 0; j < this.nc; j++) linha.push(fn(this.r + i - 1, this.c + j - 1));
      out.push(linha);
    }
    return out;
  }
  getValues()        { return this._cells((i, j) => this.sheet._get(i, j)); }
  getDisplayValues() { return this._cells((i, j) => this.sheet._display(i, j)); }
  getValue()         { return this.sheet._get(this.r - 1, this.c - 1); }
  getDisplayValue()  { return this.sheet._display(this.r - 1, this.c - 1); }
  setValue(v)  { this.sheet._set(this.r - 1, this.c - 1, v); return this; }
  setValues(m) { m.forEach((linha, i) => linha.forEach((v, j) => this.sheet._set(this.r - 1 + i, this.c - 1 + j, v))); return this; }
  clearContent() { this.sheet._set(this.r - 1, this.c - 1, ''); return this; }
  copyTo() { return this; }
}

class FakeSheet {
  constructor(nome, grid) { this.nome = nome; this.grid = grid; }
  getName() { return this.nome; }
  _get(i, j)     { return (this.grid[i] && this.grid[i][j] !== undefined) ? this.grid[i][j] : ''; }
  _display(i, j) {
    const v = this._get(i, j);
    return typeof v === 'number'
      ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(v);
  }
  _set(i, j, v) { while (this.grid.length <= i) this.grid.push([]); this.grid[i][j] = v; }
  getLastRow()    { let u = 0; this.grid.forEach((l, i) => { if (l && l.some(c => c !== '' && c != null)) u = i + 1; }); return u; }
  getLastColumn() { let u = 0; this.grid.forEach(l => { (l || []).forEach((c, j) => { if (c !== '' && c != null) u = Math.max(u, j + 1); }); }); return u; }
  getMaxColumns() { return 26; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); }
}

const ABAS = [];
global.SpreadsheetApp = {
  openById: () => ({ getSheets: () => ABAS }),
  flush: () => {},
  CopyPasteType: { PASTE_FORMAT: 'fmt' }
};
global.ContentService = {
  MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
  createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } })
};
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.Logger = { log: () => {} };

// ── Fixture: recorte fiel da aba "8 - Agosto" ────────────────────────────────
const H = ['Detalhes da despesa', 'Data', 'Categoria', 'Orçamento', 'Custo', 'Data da transação', 'Observações'];
const agosto = new FakeSheet('8 - Agosto', [
  H.slice(),
  ['Aluguel',            '07/08',      'Casa ',        1746.09, 1746.09, '06/08/2026', ''],
  ['Condomínio',         '07/08',      'Casa ',         650.00,  681.00, '06/08/2026', ''],
  ['Conta de energia',   '30/08',      'Casa ',         150.00,      '',           '', ''],
  ['Mercado',                 '', 'Alimentação',        800.00,  145.00, '13/08/2026', ''],
  ['Conta de internet',  '20/08',      'Casa ',         100.00,      '',           '', ''],
  // As 3 linhas quebradas pelo script antigo: categoria na B, orçamento clonado do custo
  ['Almoço Mexicano',  'Outros',            '',         210.00,  210.00, '10/08/2026', ''],
  ['Transferência carro', 'Outros',         '',          23.00,   23.00, '11/08/2026', ''],
  // Data órfã em Observações, sem custo nenhum
  ['Roupas, passeio etc ',    '',      'Melina',        100.00,      '',           '', '09/08/2026'],
]);
ABAS.push(agosto);

eval(fs.readFileSync(__dirname + '/../Codigo.gs', 'utf8'));

// ── Helpers de teste ─────────────────────────────────────────────────────────
let falhas = 0;
function checar(titulo, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? '  ✅' : '  ❌'} ${titulo}${ok ? '' : `\n       esperado ${JSON.stringify(esperado)}\n       obtido   ${JSON.stringify(real)}`}`);
}
const celula = (linha, col) => agosto._get(linha - 1, col - 1);

console.log('\n═══ 1. Mapeamento de colunas pelo cabeçalho ═══');
const cols = mapearColunas_(agosto);
checar('nome → A',              cols.nome, 1);
checar('vencimento → B',        cols.vencimento, 2);
checar('categoria → C',         cols.categoria, 3);
checar('orçamento → D',         cols.orcamento, 4);
checar('custo → E',             cols.custo, 5);
checar('data da transação → F', cols.dataTransacao, 6);
checar('"Data" NÃO capturou "Data da transação"', cols.vencimento !== cols.dataTransacao, true);

console.log('\n═══ 2. Lançamento SOMA (o bug principal) ═══');
let r = lancarCusto_({ sheet: '8 - Agosto', nome: 'Mercado', value: 232.50, date: '14/08/2026' });
checar('resposta ok',                    r.ok, true);
checar('valor anterior lido',            r.anterior, 145.00);
checar('total = 145,00 + 232,50',        r.total, 377.50);
checar('célula E5 gravada com o total',  celula(5, 5), 377.50);
checar('coluna Orçamento D5 INTACTA',    celula(5, 4), 800.00);
checar('data da transação atualizada',   celula(5, 6), '14/08/2026');

r = lancarCusto_({ sheet: '8 - Agosto', nome: 'Mercado', value: 100, date: '14/08/2026' });
checar('segundo lançamento acumula',     r.total, 477.50);
checar('E5 = 477,50',                    celula(5, 5), 477.50);

console.log('\n═══ 3. Lançamento em célula de custo vazia ═══');
r = lancarCusto_({ sheet: '8 - Agosto', nome: 'Conta de energia', value: 163.44, date: '14/08/2026' });
checar('parte do zero',      r.anterior, 0);
checar('total = 163,44',     r.total, 163.44);
checar('D4 (orçamento) intacto', celula(4, 4), 150.00);

console.log('\n═══ 4. Modo substituir (correção manual) ═══');
r = lancarCusto_({ sheet: '8 - Agosto', nome: 'Mercado', value: 300, modo: 'substituir' });
checar('substitui em vez de somar', r.total, 300);
checar('E5 = 300',                  celula(5, 5), 300);

console.log('\n═══ 5. Nome com acento/espaço extra e linha sugerida errada ═══');
r = lancarCusto_({ sheet: '8 - Agosto', nome: 'CONDOMINIO', row: 99, value: 19 });
checar('achou "Condomínio" ignorando acento/caixa', r.row, 3);
checar('somou 681 + 19', r.total, 700);

console.log('\n═══ 6. Item inexistente não escreve nada ═══');
const antes = JSON.stringify(agosto.grid);
r = lancarCusto_({ sheet: '8 - Agosto', nome: 'Item que não existe', value: 50 });
checar('devolve notFound',        r.notFound, true);
checar('planilha não foi tocada', JSON.stringify(agosto.grid) === antes, true);

console.log('\n═══ 7. Inserir novo item (aba "Outros") ═══');
r = inserirLinha_({ sheet: '8 - Agosto', nome: 'Farmácia', categoria: 'Pessoal', value: 74.9, date: '14/08/2026' });
const nova = r.row;
checar('nome em A',                     celula(nova, 1), 'Farmácia');
checar('vencimento B vazio',            celula(nova, 2), '');
checar('categoria em C (não em B!)',    celula(nova, 3), 'Pessoal');
checar('ORÇAMENTO D vazio',             celula(nova, 4), '');
checar('custo em E',                    celula(nova, 5), 74.9);
checar('data da transação em F',        celula(nova, 6), '14/08/2026');

r = inserirLinha_({ sheet: '8 - Agosto', nome: 'farmacia', categoria: 'Pessoal', value: 25.1, date: '14/08/2026' });
checar('item repetido soma na linha existente', r.total, 100);
checar('não duplicou linha',                    r.row, nova);

console.log('\n═══ 8. Leitura devolve números limpos ═══');
const leitura = lerAba_('8 - Agosto');
const mercado = leitura.data.find(d => d.nome === 'Mercado');
checar('orçamento numérico',      mercado.orcamento, 800);
checar('custo numérico',          mercado.custo, 300);
checar('categoria sem espaço',    leitura.data.find(d => d.nome === 'Aluguel').categoria, 'Casa');
checar('colunas expostas ao app', leitura.colunas.custo, 'E');

console.log('\n═══ 9. corrigirPlanilha() nas linhas quebradas ═══');
console.log(corrigir_(false).split('\n').map(l => '     ' + l).join('\n'));
checar('L7 categoria movida B→C',   celula(7, 3), 'Outros');
checar('L7 coluna B limpa',          celula(7, 2), '');
checar('L7 orçamento clonado limpo', celula(7, 4), '');
checar('L7 custo preservado',        celula(7, 5), 210.00);
checar('L8 categoria movida B→C',    celula(8, 3), 'Outros');
checar('L8 orçamento clonado limpo', celula(8, 4), '');
checar('L9 data órfã removida de G', celula(9, 7), '');
checar('L9 orçamento real preservado', celula(9, 4), 100.00);
checar('L2 (linha correta) não mexeu — cat', celula(2, 3), 'Casa ');
checar('L2 (linha correta) não mexeu — B',   celula(2, 2), '07/08');
checar('L2 orçamento preservado',            celula(2, 4), 1746.09);

console.log('\n═══ 10. Roteador HTTP / JSONP ═══');
const resp = doGet({ parameter: { action: 'read', sheet: '8 - Agosto', callback: 'cb' } });
checar('resposta é JSONP', /^cb\(\{.*\}\);$/.test(resp.getContent()), true);
const ping = JSON.parse(doGet({ parameter: { action: 'ping' } }).getContent());
checar('versão declarada', ping.versao, '2026.08-somar');
const ruim = JSON.parse(doGet({ parameter: { action: 'xpto' } }).getContent());
checar('ação inválida devolve erro', ruim.ok, false);

console.log(falhas === 0
  ? '\n══════════════════════════════════\n  ✅ TODOS OS TESTES PASSARAM\n══════════════════════════════════\n'
  : `\n  ❌ ${falhas} FALHA(S)\n`);
process.exit(falhas ? 1 : 0);
