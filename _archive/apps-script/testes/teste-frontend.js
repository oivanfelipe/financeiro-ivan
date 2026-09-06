const { chromium } = require('playwright');

// Recorte real da aba "9 - Setembro"
const DADOS = [
  {row:2,nome:'Aluguel',vencimento:'07/09',categoria:'Casa ',orcamento:1746.09,custo:1746.09,dataTransacao:''},
  {row:3,nome:'Condomínio',vencimento:'07/09',categoria:'Casa ',orcamento:650,custo:null,dataTransacao:''},
  {row:4,nome:'Conta de energia',vencimento:'30/09',categoria:'Casa ',orcamento:150,custo:null,dataTransacao:''},
  {row:5,nome:'Conta de gás',vencimento:'03/09',categoria:'Casa ',orcamento:50,custo:null,dataTransacao:''},
  {row:8,nome:'Youtube',vencimento:'AUTOMÁTICO',categoria:'Streaming e assinaturas',orcamento:54,custo:54,dataTransacao:''},
  {row:18,nome:'Mercado',vencimento:'',categoria:'Alimentação',orcamento:800,custo:145,dataTransacao:''},
  {row:19,nome:'Padaria',vencimento:'',categoria:'Alimentação',orcamento:80,custo:70,dataTransacao:''},
  {row:22,nome:'Combustível',vencimento:'',categoria:'Carro',orcamento:800,custo:900,dataTransacao:''},
  {row:29,nome:'Escola',vencimento:'07/09',categoria:'Melina',orcamento:1319,custo:1319,dataTransacao:''},
  {row:41,nome:'Cinema',vencimento:'',categoria:'Outros',orcamento:null,custo:53,dataTransacao:''},
  {row:23,nome:'Seguro carro',vencimento:'AUTOMÁTICO',categoria:'Carro',orcamento:69,custo:null,dataTransacao:''},
  {row:38,nome:'Aniversário vó',vencimento:'',categoria:'Presentes',orcamento:120,custo:null,dataTransacao:''},
];

const APP = 'file://' + require('path').resolve(__dirname, '../../index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    const txt = m.text();
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|cdnjs/.test(txt)) erros.push('CONSOLE: ' + txt);
  });

  // Intercepta o JSONP e devolve respostas falsas com a mesma forma do backend
  const rota = route => {
    const url = new URL(route.request().url());
    const cb = url.searchParams.get('callback');
    const acao = (url.searchParams.get('action') || '').toLowerCase();
    let payload;
    if (acao === 'getsheets') {
      payload = { ok:true, versao:'2026.08-somar', sheets:['8 - Agosto','9 - Setembro','10 - Outubro'], mesAtual:'8 - Agosto' };
    } else if (acao === 'read') {
      payload = { ok:true, versao:'2026.08-somar', sheet:url.searchParams.get('sheet'),
                  colunas:{nome:'A',vencimento:'B',categoria:'C',orcamento:'D',custo:'E',dataTransacao:'F',observacoes:'G'},
                  data: DADOS };
    } else if (acao === 'lancar') {
      const row = parseInt(url.searchParams.get('row'),10);
      const item = DADOS.find(d => d.row === row);
      const v = parseFloat(url.searchParams.get('value'));
      const anterior = item.custo || 0;
      payload = { ok:true, versao:'2026.08-somar', row, nome:item.nome, categoria:item.categoria,
                  modo:'somar', anterior, lancado:v, total:anterior+v, orcamento:item.orcamento, colunaCusto:'E' };
      globalThis.__ultimoLancamento = payload;
    }
    route.fulfill({ contentType:'text/javascript', body: `${cb}(${JSON.stringify(payload)});` });
  };
  await page.route('**/script.google.com/**', rota);

  await page.addInitScript(() => {
    window.Chart = class { constructor(ctx, cfg) { window.__chart = cfg; } destroy() {} };
  });
  await page.goto('file://' + '/home/user/financeiro-ivan/index.html');
  await page.waitForTimeout(1200);

  const t = async (nome, fn) => {
    try { const r = await fn(); console.log((r?'  ✅ ':'  ❌ ')+nome); return r?0:1; }
    catch(e){ console.log('  ❌ '+nome+' → '+e.message); return 1; }
  };
  let f = 0;

  console.log('\n═══ Front-end ═══');
  f += await t('abre no mês corrente (8 - Agosto), não na última aba',
    async () => (await page.inputValue('#mes-select')) === '8 - Agosto');
  f += await t('subtítulo aponta a coluna Custo',
    async () => (await page.textContent('#subtitulo')).includes('coluna E (Custo)'));
  f += await t('sem aviso de script desatualizado',
    async () => (await page.textContent('#aviso-global')).trim() === '');
  f += await t('categorias vieram da planilha',
    async () => (await page.$$eval('#f-categoria option', o => o.map(x=>x.value))).includes('Alimentação'));
  f += await t('modo "Somar" é o padrão',
    async () => (await page.getAttribute('.modo-btn[data-modo="somar"]','class')).includes('active'));

  console.log('\n═══ Preview do lançamento ═══');
  await page.selectOption('#f-categoria','Alimentação');
  await page.selectOption('#f-item','18');           // Mercado, custo 145
  await page.fill('#f-valor','232.50');
  await page.waitForTimeout(150);
  const info = await page.textContent('#f-info');
  f += await t('mostra o já gasto (145,00)', async () => info.includes('145,00'));
  f += await t('mostra o total somado (377,50)', async () => info.includes('377,50'));
  f += await t('mostra a sobra do orçamento (422,50)', async () => info.includes('422,50'));

  await page.click('.modo-btn[data-modo="substituir"]');
  await page.waitForTimeout(150);
  f += await t('modo substituir muda o total para 232,50',
    async () => (await page.textContent('#f-info')).includes('232,50'));
  await page.click('.modo-btn[data-modo="somar"]');

  console.log('\n═══ Gravação ═══');
  await page.click('#f-salvar');
  await page.waitForTimeout(700);
  const toast = await page.textContent('#toast');
  f += await t('toast mostra a conta 145 + 232,50 = 377,50',
    async () => toast.includes('145,00') && toast.includes('232,50') && toast.includes('377,50'));

  console.log('\n═══ Contas ═══');
  await page.click('.tab-btn[data-tab="contas"]');
  await page.waitForTimeout(300);
  const contas = await page.textContent('#contas-root');
  f += await t('lista contas com vencimento na coluna B', async () => contas.includes('Conta de gás'));
  f += await t('marca débito automático ainda não pago', async () => contas.includes('Automático'));
  f += await t('conta automática já paga vira "Pago", não "Automático"',
    async () => /Youtube[\s\S]{0,400}✓ Pago/.test(contas));
  f += await t('não lista itens sem vencimento (Mercado)', async () => !contas.includes('Mercado'));
  f += await t('Escola aparece quitada', async () => contas.includes('✓ Pago'));

  console.log('\n═══ Dashboard ═══');
  await page.click('.tab-btn[data-tab="dashboard"]');
  await page.waitForTimeout(600);
  const dash = await page.textContent('#dash-root');
  f += await t('acusa estouro do Combustível', async () => dash.includes('Acima do orçamento'));
  f += await t('renderiza o gráfico', async () => (await page.$('#pie-chart')) !== null);
  f += await t('gráfico ignora categoria sem gasto (Presentes)', async () => {
    const cfg = await page.evaluate(() => window.__chart);
    return cfg.data.labels.includes('Carro') && !cfg.data.labels.includes('Presentes');
  });
  f += await t('mas Presentes aparece no detalhamento com orçamento',
    async () => dash.includes('Presentes') && dash.includes('sobram R$ 120,00'));
  f += await t('filtro por categoria disponível',
    async () => (await page.$$eval('.filtro-pill', p => p.map(x=>x.textContent.trim()))).includes('Carro'));
  await page.click('.filtro-pill:has-text("Carro")');
  await page.waitForTimeout(300);
  f += await t('filtro reduz para só Carro',
    async () => !(await page.textContent('#dash-root')).includes('Padaria'));

  console.log('\n═══ Resiliência ═══');

  // (a) Chart.js do CDN não carregou — o app não pode morrer por causa disso
  const p2 = await browser.newPage();
  await p2.route('**/script.google.com/**', rota);
  await p2.goto(APP);                                    // sem stub do Chart
  await p2.waitForTimeout(1200);
  f += await t('sem Chart.js, a aba de lançar continua funcionando',
    async () => (await p2.$('#f-categoria')) !== null);
  f += await t('sem Chart.js, as contas continuam funcionando',
    async () => (await p2.textContent('#contas-root')).includes('Conta de gás'));
  f += await t('sem Chart.js, o dashboard ainda mostra os números',
    async () => (await p2.textContent('#dash-root')).includes('Total orçado'));
  await p2.close();

  // (b) Apps Script antigo publicado — precisa avisar, não gravar errado calado
  const p3 = await browser.newPage();
  await p3.route('**/script.google.com/**', r => {
    const u = new URL(r.request().url());
    const cb = u.searchParams.get('callback');
    const acao = (u.searchParams.get('action') || '').toLowerCase();
    const corpo = acao === 'getsheets'
      ? { ok:true, sheets:['8 - Agosto'], versao:'antiga' }
      : { ok:true, sheet:'8 - Agosto', colunas:{custo:'E',orcamento:'D'}, data:DADOS, versao:'antiga' };
    r.fulfill({ contentType:'text/javascript', body:`${cb}(${JSON.stringify(corpo)});` });
  });
  await p3.goto(APP);
  await p3.waitForTimeout(1200);
  f += await t('avisa que o Apps Script está desatualizado',
    async () => (await p3.textContent('#aviso-global')).includes('desatualizado'));
  await p3.close();

  console.log(erros.length ? '\n⚠️ ERROS DE CONSOLE:\n' + erros.join('\n') : '\n✅ Nenhum erro de JS no console');
  console.log(f===0 ? '\n══════════════════════════════════\n  ✅ SMOKE TEST OK\n══════════════════════════════════\n' : `\n  ❌ ${f} falha(s)\n`);
  await browser.close();
  process.exit(f || erros.length ? 1 : 0);
})();
