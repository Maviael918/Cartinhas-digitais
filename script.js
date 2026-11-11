const exemplos = {
  SE1: {
    formula: '=SE(A1 >= 10; A1 + 10; A1 * 5)',
    titulo: 'SE: o porteiro da pontuação',
    analogia: 'Imagine um porteiro que confere se a pontuação em A1 chegou a 10. Se chegou, soma 10 pontos de bônus; se não, multiplica a pontuação por 5. O SE sempre escolhe apenas um dos dois caminhos.'
  },
  SE2: {
    formula: '=SE(A2 <= 20; A2 * 2; A2 - 5)',
    titulo: 'SE: promoção por quantidade',
    analogia: 'Pense em uma promoção: compras de até 20 unidades têm a quantidade dobrada; acima de 20, são descontadas 5 unidades. A condição vem primeiro, depois o resultado para VERDADEIRO e o resultado para FALSO.'
  },
  SOMA: {
    formula: '=SOMA(A1;A3) * 2',
    titulo: 'SOMA: o caixa do carrinho',
    analogia: 'O caixa junta os valores de A1 e A3. Depois, a multiplicação por 2 vale para o total inteiro. O ponto e vírgula separa os argumentos: aqui, a função soma somente essas duas células.'
  },
  SOMA_INTERVALO: {
    formula: '=SOMA(A1:A3)',
    titulo: 'SOMA: juntar a coluna',
    analogia: 'Imagine recolher todos os valores de A1 até A3, como juntar moedas de três espaços de um cofrinho. Os dois-pontos indicam um intervalo contínuo, incluindo a primeira e a última célula.'
  }
};

function obterValorCelula(referencia) {
  const elemento = document.getElementById(`cell${referencia.toUpperCase()}`);
  if (!elemento) {
    throw new Error(`A célula ${referencia.toUpperCase()} não existe nesta tabela.`);
  }

  const valor = elemento.value.trim();
  if (valor === '' || !Number.isFinite(Number(valor))) {
    throw new Error(`A célula ${referencia.toUpperCase()} precisa conter um número.`);
  }
  return Number(valor);
}

function calcularExpressao(expressao) {
  const compacta = expressao.replace(/\s+/g, '');
  const tokens = compacta.match(/\d+(?:\.\d+)?|[()+*/-]/g) || [];
  if (tokens.join('') !== compacta) {
    throw new Error('Use números e os operadores +, -, * e / na conta.');
  }

  let posicao = 0;
  function fator() {
    const token = tokens[posicao];
    if (token === '+' || token === '-') {
      posicao++;
      const valor = fator();
      return token === '-' ? -valor : valor;
    }
    if (token === '(') {
      posicao++;
      const valor = expressaoAritmetica();
      if (tokens[posicao] !== ')') throw new Error('Confira os parênteses da fórmula.');
      posicao++;
      return valor;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
      throw new Error('Confira a conta da fórmula.');
    }
    posicao++;
    return Number(token);
  }

  function termo() {
    let valor = fator();
    while (tokens[posicao] === '*' || tokens[posicao] === '/') {
      const operador = tokens[posicao++];
      const proximo = fator();
      if (operador === '/' && proximo === 0) throw new Error('Não é possível dividir por zero.');
      valor = operador === '*' ? valor * proximo : valor / proximo;
    }
    return valor;
  }

  function expressaoAritmetica() {
    let valor = termo();
    while (tokens[posicao] === '+' || tokens[posicao] === '-') {
      const operador = tokens[posicao++];
      const proximo = termo();
      valor = operador === '+' ? valor + proximo : valor - proximo;
    }
    return valor;
  }

  const resultado = expressaoAritmetica();
  if (posicao !== tokens.length || !Number.isFinite(resultado)) {
    throw new Error('Confira os operadores e os valores da fórmula.');
  }
  return resultado;
}

function substituirCelulas(expressao) {
  return expressao.replace(/\b[A-Z]+\d+\b/gi, referencia =>
    String(obterValorCelula(referencia))
  );
}

function resolverSE(formula) {
  const match = formula.match(/^=SE\((.*)\)$/i);
  if (!match) throw new Error('Use o formato =SE(teste; valor_se_verdadeiro; valor_se_falso).');

  const partes = match[1].split(';').map(parte => parte.trim());
  if (partes.length !== 3) {
    throw new Error('A função SE precisa de 3 partes separadas por ponto e vírgula.');
  }

  const teste = partes[0].match(/^([A-Z]+\d+)\s*(>=|<=|<>|=|>|<)\s*([A-Z]+\d+|\d+(?:\.\d+)?)$/i);
  if (!teste) {
    throw new Error('No teste do SE, compare uma célula com um número ou outra célula (ex.: A1 >= 10).');
  }

  const [, referencia, operador, valorDireito] = teste;
  const valorEsquerdo = obterValorCelula(referencia);
  const limite = /^[A-Z]+\d+$/i.test(valorDireito) ? obterValorCelula(valorDireito) : Number(valorDireito);
  const comparacoes = {
    '>': valorEsquerdo > limite,
    '<': valorEsquerdo < limite,
    '>=': valorEsquerdo >= limite,
    '<=': valorEsquerdo <= limite,
    '=': valorEsquerdo === limite,
    '<>': valorEsquerdo !== limite
  };
  const verdadeiro = comparacoes[operador];
  const expressaoEscolhida = verdadeiro ? partes[1] : partes[2];
  const contaSubstituida = substituirCelulas(expressaoEscolhida);
  const resultado = calcularExpressao(contaSubstituida);

  return {
    resultado,
    passos: `1. A célula ${referencia.toUpperCase()} vale ${valorEsquerdo}.\n2. Teste: ${valorEsquerdo} ${operador} ${limite} = ${verdadeiro ? 'VERDADEIRO' : 'FALSO'}.\n3. O SE escolhe o caminho ${verdadeiro ? 'VERDADEIRO' : 'FALSO'}: ${expressaoEscolhida}.\n4. Conta escolhida: ${contaSubstituida} = ${resultado}.`
  };
}

function somarArgumentoSoma(argumento) {
  const intervalo = argumento.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (intervalo) {
    const [, colunaInicial, linhaInicial, colunaFinal, linhaFinal] = intervalo;
    if (colunaInicial.toUpperCase() !== colunaFinal.toUpperCase()) {
      throw new Error('Neste simulador, o intervalo da SOMA deve ficar na mesma coluna.');
    }
    const inicio = Number(linhaInicial);
    const fim = Number(linhaFinal);
    const referencias = Array.from(
      { length: Math.abs(fim - inicio) + 1 },
      (_, indice) => `${colunaInicial}${inicio <= fim ? inicio + indice : inicio - indice}`
    );
    return referencias.map(referencia => ({
      referencia,
      valor: obterValorCelula(referencia)
    }));
  }

  if (!/^[A-Z]+\d+$/i.test(argumento)) {
    throw new Error('Use referências de células ou um intervalo na função SOMA.');
  }
  return [{ referencia: argumento, valor: obterValorCelula(argumento) }];
}

function resolverSOMA(formula) {
  const match = formula.match(/^=(.*)$/);
  const corpo = match && match[1];
  const somaMatch = corpo && corpo.match(/SOMA\(([^()]*)\)/i);
  if (!somaMatch) {
    throw new Error('Use SOMA com células ou intervalo, por exemplo =SOMA(A1;A3) ou =SOMA(A1:A3).');
  }

  const argumentos = somaMatch[1].split(';').map(argumento => argumento.trim());
  if (argumentos.some(argumento => !argumento)) throw new Error('Confira os argumentos da função SOMA.');
  const itens = argumentos.flatMap(somarArgumentoSoma);
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  const expressaoFinal = corpo.replace(somaMatch[0], String(total));
  const resultado = calcularExpressao(expressaoFinal);

  return {
    resultado,
    passos: `1. Valores encontrados: ${itens.map(item => `${item.referencia.toUpperCase()} = ${item.valor}`).join(', ')}.\n2. A SOMA junta esses valores: ${itens.map(item => item.valor).join(' + ')} = ${total}.\n3. Conta restante: ${expressaoFinal} = ${resultado}.`
  };
}

function calcularFormula() {
  const formula = document.getElementById('formulaInput').value.trim();
  const resultOutput = document.getElementById('resultOutput');
  const stepOutput = document.getElementById('stepByStepOutput');

  try {
    const calculo = /^=SE\(/i.test(formula) ? resolverSE(formula) : resolverSOMA(formula);
    resultOutput.textContent = calculo.resultado;
    stepOutput.textContent = calculo.passos;
  } catch (erro) {
    resultOutput.textContent = '#VALOR!';
    stepOutput.textContent = erro.message;
  }
}

function carregarPreset(tipo) {
  const exemplo = exemplos[tipo];
  if (!exemplo) return;

  document.getElementById('formulaInput').value = exemplo.formula;
  document.getElementById('analogyTitle').textContent = exemplo.titulo;
  document.getElementById('analogyText').textContent = exemplo.analogia;
  calcularFormula();
}

document.querySelectorAll('[data-preset]').forEach(botao => {
  botao.addEventListener('click', () => carregarPreset(botao.dataset.preset));
});
document.getElementById('calculateButton').addEventListener('click', calcularFormula);

function mostrarCelulaSelecionada(celula) {
  document.getElementById('selectedCell').textContent = celula.id.replace('cell', '');
  document.getElementById('cellFormulaDisplay').textContent = celula.value;
}

document.querySelectorAll('.excel-table input').forEach(celula => {
  celula.addEventListener('focus', () => mostrarCelulaSelecionada(celula));
  celula.addEventListener('input', () => mostrarCelulaSelecionada(celula));
});

function lerInteiro(id, nome, minimo = 0) {
  const texto = document.getElementById(id).value.trim();
  const valor = Number(texto);
  if (texto === '' || !Number.isSafeInteger(valor) || valor < minimo) {
    throw new Error(`${nome}: informe um número inteiro ${minimo === 0 ? 'não negativo' : 'maior que zero'}.`);
  }
  return valor;
}

function mostrarErroMatematica(id, erro) {
  const resultado = document.getElementById(id);
  resultado.classList.add('math-error');
  resultado.textContent = erro.message;
}

function formatarNumero(valor) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(valor);
}

function calcularSomaArmada() {
  const saida = document.getElementById('sumResult');
  saida.classList.remove('math-error');
  try {
    const primeiro = lerInteiro('sumFirst', 'Primeiro número');
    const segundo = lerInteiro('sumSecond', 'Segundo número');
    const total = primeiro + segundo;
    if (!Number.isSafeInteger(total)) throw new Error('A soma ultrapassa o limite de cálculo seguro.');

    const largura = Math.max(String(primeiro).length, String(segundo).length, String(total).length);
    const digitosA = String(primeiro).padStart(largura, '0');
    const digitosB = String(segundo).padStart(largura, '0');
    const vaiUm = Array(largura).fill(' ');
    const passos = [];
    let transporte = 0;
    for (let coluna = largura - 1; coluna >= 0; coluna--) {
      const entrada = transporte;
      const digitoA = Number(digitosA[coluna]);
      const digitoB = Number(digitosB[coluna]);
      const parcial = digitoA + digitoB + entrada;
      transporte = Math.floor(parcial / 10);
      if (transporte && coluna > 0) vaiUm[coluna - 1] = String(transporte);
      const posicoes = ['unidades', 'dezenas', 'centenas', 'unidades de milhar'];
      const casa = posicoes[largura - coluna - 1] || `casa ${largura - coluna}`;
      passos.unshift(
        `${casa}: ${digitoA} + ${digitoB}${entrada ? ` + ${entrada} que veio da coluna anterior` : ''} = ${parcial}; ` +
        `escreve ${parcial % 10}${transporte ? ` e leva ${transporte}` : ''}.`
      );
    }

    saida.innerHTML = `<h3>Vamos somar coluna por coluna</h3>
      <pre class="sum-work"><span class="sum-carry">  ${vaiUm.join('')}</span>
  ${digitosA}
+ ${digitosB}
  ${'-'.repeat(largura)}
  <span class="sum-answer">${String(total).padStart(largura, ' ')}</span></pre>
      <ol class="math-steps">${passos.map(passo => `<li>${passo}</li>`).join('')}</ol>
      <p><strong>Resultado: ${formatarNumero(primeiro)} + ${formatarNumero(segundo)} = ${formatarNumero(total)}.</strong></p>`;
  } catch (erro) {
    mostrarErroMatematica('sumResult', erro);
  }
}

function calcularDivisaoArmada() {
  const saida = document.getElementById('divisionResult');
  saida.classList.remove('math-error');
  try {
    const dividendo = lerInteiro('dividend', 'Dividendo');
    const divisor = lerInteiro('divisor', 'Divisor', 1);
    const quociente = Math.floor(dividendo / divisor);
    const restoFinal = dividendo % divisor;
    const passos = [];
    const operacoes = [];
    let resto = 0;
    let iniciouQuociente = false;
    for (const [indice, digito] of Array.from(String(dividendo)).entries()) {
      const restoAnterior = resto;
      const parcial = restoAnterior * 10 + Number(digito);
      const algarismo = Math.floor(parcial / divisor);
      const subtracao = algarismo * divisor;
      resto = parcial - subtracao;
      if (algarismo > 0 || iniciouQuociente) {
        iniciouQuociente = true;
        operacoes.push({ indice, parcial, subtracao, resto });
      }
      passos.push(
        `Descemos o algarismo ${digito}: ${restoAnterior} × 10 + ${digito} = ${parcial}. ` +
        `${parcial} ÷ ${divisor} = ${algarismo} nesta casa; ${algarismo} × ${divisor} = ${subtracao}; ` +
        `${parcial} − ${subtracao} = ${resto}.`
      );
    }

    const larguraConta = String(dividendo).length + 1;
    const alinhar = (valor, indiceFinal, negativo = false) => {
      const texto = String(valor);
      const inicioNumero = indiceFinal - texto.length + 2;
      return `${' '.repeat(Math.max(0, inicioNumero - (negativo ? 1 : 0)))}${negativo ? '-' : ''}${texto}`;
    };
    const linhasConta = [` ${dividendo} | ${divisor}`];
    if (operacoes.length) {
      const primeira = operacoes[0];
      linhasConta.push(`${alinhar(primeira.subtracao, primeira.indice, true).padEnd(larguraConta)} | ${quociente}`);
      for (const [indice, operacao] of operacoes.entries()) {
        if (indice > 0) linhasConta.push(alinhar(operacao.parcial, operacao.indice));
        const subtracao = alinhar(operacao.subtracao, operacao.indice, true);
        if (indice > 0) linhasConta.push(subtracao);
        linhasConta.push(`${' '.repeat(Math.max(0, subtracao.length - String(operacao.subtracao).length - 1))}${'-'.repeat(String(operacao.subtracao).length + 1)}`);
        linhasConta.push(alinhar(operacao.resto, operacao.indice));
      }
    } else {
      linhasConta.push(`${' '.repeat(larguraConta + 3)}${quociente}`);
      linhasConta.push(` ${dividendo}`);
    }

    saida.innerHTML = `<h3>Divisão armada</h3>
      <pre class="division-work" aria-label="${dividendo} dividido por ${divisor}, quociente ${quociente} e resto ${restoFinal}">${linhasConta.join('\n')}</pre>
      <ol class="division-steps">${passos.map(passo => `<li>${passo}</li>`).join('')}</ol>
      <p><strong>${dividendo} ÷ ${divisor} = ${quociente}, com resto ${restoFinal}.</strong></p>`;
  } catch (erro) {
    mostrarErroMatematica('divisionResult', erro);
  }
}

function calcularRegraDeTres() {
  const saida = document.getElementById('ruleResult');
  saida.classList.remove('math-error');
  try {
    const campos = ['ruleA', 'ruleB', 'ruleC'].map(id => document.getElementById(id).value.trim());
    const [a, b, c] = campos.map(Number);
    if (campos.some(valor => valor === '') || ![a, b, c].every(Number.isFinite) || a <= 0 || b < 0 || c < 0) {
      throw new Error('Informe A maior que zero e valores B e C não negativos.');
    }

    const produto = b * c;
    const x = produto / a;
    if (!Number.isFinite(x)) throw new Error('Não foi possível calcular X com esses valores.');
    saida.innerHTML = `<h3>Multiplicação cruzada</h3>
      <p class="proportion-work">${formatarNumero(a)} → ${formatarNumero(b)}<br>${formatarNumero(c)} → X</p>
      <ol class="rule-steps">
        <li>Multiplique cruzado: ${formatarNumero(b)} × ${formatarNumero(c)} = ${formatarNumero(produto)}.</li>
        <li>Divida pelo valor que ficou com X: ${formatarNumero(produto)} ÷ ${formatarNumero(a)} = ${formatarNumero(x)}.</li>
      </ol>
      <p><strong>X = ${formatarNumero(x)}.</strong> Exemplo de proporção direta: se ${formatarNumero(a)} corresponde a ${formatarNumero(b)}, então ${formatarNumero(c)} corresponde a ${formatarNumero(x)}.</p>`;
  } catch (erro) {
    mostrarErroMatematica('ruleResult', erro);
  }
}

let tipoProblemaAtual = 'soma';
let problemaAtual = null;

function numeroAleatorio(minimo, maximo) {
  return Math.floor(Math.random() * (maximo - minimo + 1)) + minimo;
}

function criarProblema(tipo) {
  if (tipo === 'soma') {
    const primeiro = numeroAleatorio(4, 48);
    const segundo = numeroAleatorio(3, 39);
    const historias = [
      `Joana tinha ${primeiro} máquinas de costura em sua oficina e comprou mais ${segundo}. Quantas máquinas ela tem agora?`,
      `Uma biblioteca recebeu ${primeiro} livros de manhã e ${segundo} à tarde. Quantos livros recebeu ao todo?`,
      `Carlos separou ${primeiro} mudas para plantar e depois ganhou mais ${segundo}. Com quantas mudas ele ficou?`
    ];
    return {
      pergunta: historias[numeroAleatorio(0, historias.length - 1)],
      resposta: primeiro + segundo,
      explicacao: `Como a quantidade aumentou, fazemos uma soma: ${primeiro} + ${segundo} = ${primeiro + segundo}.`
    };
  }

  if (tipo === 'divisao') {
    const divisor = numeroAleatorio(2, 9);
    const quociente = numeroAleatorio(3, 12);
    const total = divisor * quociente;
    const historias = [
      `Joana tem ${total} peças para distribuir igualmente entre ${divisor} máquinas. Quantas peças ficam para cada máquina?`,
      `Uma escola organizou ${total} estudantes em ${divisor} grupos iguais. Quantos estudantes ficam em cada grupo?`,
      `Há ${total} mudas para colocar igualmente em ${divisor} fileiras. Quantas mudas vão em cada fileira?`
    ];
    return {
      pergunta: historias[numeroAleatorio(0, historias.length - 1)],
      resposta: quociente,
      explicacao: `Como vamos repartir em partes iguais, dividimos: ${total} ÷ ${divisor} = ${quociente}.`
    };
  }

  const fator = numeroAleatorio(2, 9);
  const maquinasInicial = numeroAleatorio(2, 6);
  const maquinasFinal = numeroAleatorio(maquinasInicial + 1, maquinasInicial + 4);
  const producaoInicial = maquinasInicial * fator;
  const producaoFinal = maquinasFinal * fator;
  const historias = [
    `Em uma hora, ${maquinasInicial} máquinas produzem ${producaoInicial} peças. Mantendo o mesmo ritmo, quantas peças ${maquinasFinal} máquinas produzirão em uma hora?`,
    `${maquinasInicial} funcionários organizam ${producaoInicial} caixas em um turno. No mesmo ritmo, quantas caixas ${maquinasFinal} funcionários organizarão?`,
    `Uma equipe de ${maquinasInicial} pessoas planta ${producaoInicial} árvores por dia. No mesmo ritmo, quantas árvores ${maquinasFinal} pessoas plantarão?`
  ];
  return {
    pergunta: historias[numeroAleatorio(0, historias.length - 1)],
    resposta: producaoFinal,
    explicacao: `Montamos a proporção: ${maquinasInicial} → ${producaoInicial} e ${maquinasFinal} → X. Multiplicando cruzado: X = (${producaoInicial} × ${maquinasFinal}) ÷ ${maquinasInicial} = ${producaoFinal}.`
  };
}

function gerarProblema() {
  problemaAtual = criarProblema(tipoProblemaAtual);
  document.getElementById('wordProblemText').textContent = problemaAtual.pergunta;
  document.getElementById('wordProblemAnswer').value = '';
  const feedback = document.getElementById('wordProblemFeedback');
  feedback.classList.remove('math-error');
  feedback.textContent = 'Resolva o problema e confira sua resposta.';
}

function conferirProblema() {
  const entrada = document.getElementById('wordProblemAnswer').value.trim().replace(',', '.');
  const feedback = document.getElementById('wordProblemFeedback');
  feedback.classList.remove('math-error');
  if (!entrada || !/^[+-]?\d+(?:\.\d+)?$/.test(entrada) || !Number.isFinite(Number(entrada))) {
    mostrarErroMatematica('wordProblemFeedback', new Error('Digite uma resposta numérica para conferir.'));
    return;
  }

  const acertou = Math.abs(Number(entrada) - problemaAtual.resposta) < 0.000001;
  feedback.innerHTML = `<h3>${acertou ? 'Muito bem, você acertou!' : 'Quase! Veja como resolver:'}</h3>
    <p>${problemaAtual.explicacao}</p>
    <p><strong>Resposta: ${formatarNumero(problemaAtual.resposta)}.</strong></p>`;
}

document.querySelectorAll('[data-problem-mode]').forEach(botao => {
  botao.addEventListener('click', () => {
    tipoProblemaAtual = botao.dataset.problemMode;
    document.querySelectorAll('[data-problem-mode]').forEach(opcao => {
      const selecionado = opcao === botao;
      opcao.classList.toggle('active', selecionado);
      opcao.setAttribute('aria-pressed', String(selecionado));
    });
    gerarProblema();
  });
});

document.getElementById('newWordProblem').addEventListener('click', gerarProblema);
document.getElementById('checkWordProblem').addEventListener('click', conferirProblema);
document.getElementById('wordProblemAnswer').addEventListener('keydown', evento => {
  if (evento.key === 'Enter') conferirProblema();
});

document.getElementById('calculateSum').addEventListener('click', calcularSomaArmada);
document.getElementById('calculateDivision').addEventListener('click', calcularDivisaoArmada);
document.getElementById('calculateRule').addEventListener('click', calcularRegraDeTres);

document.querySelectorAll('[data-math-mode]').forEach(botao => {
  botao.addEventListener('click', () => {
    const modo = botao.dataset.mathMode;
    document.querySelectorAll('[data-math-mode]').forEach(opcao => {
      const selecionado = opcao === botao;
      opcao.classList.toggle('active', selecionado);
      opcao.setAttribute('aria-pressed', String(selecionado));
    });
    document.querySelectorAll('[data-math-panel]').forEach(painel => {
      painel.hidden = painel.dataset.mathPanel !== modo;
    });
  });
});

const financeStorageKey = 'painel-estudos-financas-v1';
const usuarioFinanceiroKey = 'painel-estudos-financas-usuario';
const limiteMensalCarroCentavos = 20000;
const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let dadosFinanceiros;
let chaveArmazenamentoAtiva = financeStorageKey;
let usuarioSupabase = null;
let clienteSupabase = null;
let filaDeSincronizacao = Promise.resolve();

function dataAtualLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function criarIdFinanceiro() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else bytes.forEach((_, indice) => { bytes[indice] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const valor = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${valor.slice(0, 8)}-${valor.slice(8, 12)}-${valor.slice(12, 16)}-${valor.slice(16, 20)}-${valor.slice(20)}`;
}

function dataFinanceiraValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const dataConvertida = new Date(ano, mes - 1, dia);
  return dataConvertida.getFullYear() === ano &&
    dataConvertida.getMonth() === mes - 1 &&
    dataConvertida.getDate() === dia;
}

function definirStatusFinanceiro(mensagem, erro = false) {
  const status = document.getElementById('financeStatus');
  status.textContent = mensagem;
  status.classList.toggle('finance-status-error', erro);
}

function carregarDadosFinanceiros(chave = financeStorageKey) {
  const salvo = localStorage.getItem(chave);
  if (salvo === null) {
    return {
      categories: [{ id: criarIdFinanceiro(), name: 'Meu carro', limitCents: 20000 }],
      expenses: [],
      carInsurance: { isInsured: false, monthlyValueCents: 0 }
    };
  }

  const dados = JSON.parse(salvo);
  const categoriasValidas = Array.isArray(dados.categories) && dados.categories.every(categoria =>
    categoria &&
    typeof categoria.id === 'string' &&
    typeof categoria.name === 'string' &&
    Number.isSafeInteger(categoria.limitCents) &&
    categoria.limitCents > 0
  );
  const despesasValidas = Array.isArray(dados.expenses) && dados.expenses.every(despesa =>
    despesa &&
    typeof despesa.id === 'string' &&
    typeof despesa.categoryId === 'string' &&
    typeof despesa.description === 'string' &&
    typeof despesa.date === 'string' &&
    dataFinanceiraValida(despesa.date) &&
    Number.isSafeInteger(despesa.amountCents) &&
    despesa.amountCents > 0
  );
  if (!categoriasValidas || !despesasValidas) {
    throw new Error('Os dados financeiros salvos estão em um formato inválido.');
  }
  if (dados.carInsurance === undefined) {
    dados.carInsurance = { isInsured: false, monthlyValueCents: 0 };
  }
  if (!dados.carInsurance || typeof dados.carInsurance.isInsured !== 'boolean' ||
      !Number.isSafeInteger(dados.carInsurance.monthlyValueCents) ||
      dados.carInsurance.monthlyValueCents < 0) {
    throw new Error('Os dados do seguro do carro estão em um formato inválido.');
  }
  let cotaCarroCorrigida = false;
  dados.categories.forEach(categoria => {
    if (categoria.name.trim().toLocaleLowerCase('pt-BR') === 'meu carro' &&
        categoria.limitCents > limiteMensalCarroCentavos) {
      categoria.limitCents = limiteMensalCarroCentavos;
      cotaCarroCorrigida = true;
    }
  });
  if (cotaCarroCorrigida) {
    localStorage.setItem(chave, JSON.stringify(dados));
    definirStatusFinanceiro('A cota mensal de “Meu carro” foi ajustada para o máximo de R$ 200,00.');
  }
  return dados;
}

function salvarDadosFinanceiros(proximosDados) {
  try {
    const dadosAnteriores = dadosFinanceiros;
    localStorage.setItem(chaveArmazenamentoAtiva, JSON.stringify(proximosDados));
    dadosFinanceiros = proximosDados;
    if (usuarioSupabase) {
      enfileirarSincronizacao(proximosDados, dadosAnteriores);
    }
    return true;
  } catch (erro) {
    definirStatusFinanceiro(`Não foi possível salvar. A alteração não foi aplicada. ${erro.message}`, true);
    return false;
  }
}

function definirStatusConta(mensagem, erro = false) {
  const status = document.getElementById('authStatus');
  status.textContent = mensagem;
  status.classList.toggle('finance-status-error', erro);
}

function atualizarInterfaceConta() {
  const autenticado = Boolean(usuarioSupabase);
  const supabaseDisponivel = Boolean(clienteSupabase);
  document.getElementById('signInButton').hidden = autenticado;
  document.getElementById('signUpButton').hidden = autenticado;
  document.getElementById('signOutButton').hidden = !autenticado;
  document.getElementById('authEmail').disabled = autenticado || !supabaseDisponivel;
  document.getElementById('authPassword').disabled = autenticado || !supabaseDisponivel;
  document.getElementById('signInButton').disabled = !supabaseDisponivel;
  document.getElementById('signUpButton').disabled = !supabaseDisponivel;
  const formulario = document.getElementById('authForm');
  formulario.classList.toggle('auth-form-signed-in', autenticado);
  document.getElementById('supabaseConnectionStatus').textContent = autenticado
    ? `Conta ativa: ${usuarioSupabase.email}. Os dados sincronizam quando há conexão.`
    : clienteSupabase
      ? 'Entre ou crie uma conta para sincronizar seus dados financeiros entre aparelhos.'
      : 'Configure a URL e a chave pública do projeto em supabase-config.js para ativar a sincronização. Os dados continuam salvos neste navegador.';
}

function validarConfiguracaoSupabase(configuracao) {
  if (!configuracao || typeof configuracao.url !== 'string' || typeof configuracao.anonKey !== 'string') return false;
  if (configuracao.url.includes('SEU-PROJETO') || configuracao.anonKey.includes('COLE_A_CHAVE')) return false;
  try {
    const url = new URL(configuracao.url);
    return url.protocol === 'https:' && configuracao.anonKey.length > 20;
  } catch {
    return false;
  }
}

async function carregarDadosRemotos() {
  const [categoriasResposta, despesasResposta, seguroResposta] = await Promise.all([
    clienteSupabase.from('finance_categories').select('id, name, monthly_limit_cents').order('created_at'),
    clienteSupabase.from('finance_expenses').select('id, category_id, description, amount_cents, spent_on').order('spent_on', { ascending: false }),
    clienteSupabase.from('car_insurance_settings').select('is_insured, monthly_value_cents').maybeSingle()
  ]);
  if (categoriasResposta.error) throw categoriasResposta.error;
  if (despesasResposta.error) throw despesasResposta.error;
  if (seguroResposta.error) throw seguroResposta.error;

  const categorias = categoriasResposta.data.map(categoria => ({
    id: categoria.id,
    name: categoria.name,
    limitCents: categoria.monthly_limit_cents
  }));
  const despesas = despesasResposta.data.map(despesa => ({
    id: despesa.id,
    categoryId: despesa.category_id,
    description: despesa.description,
    amountCents: despesa.amount_cents,
    date: despesa.spent_on
  }));
  return {
    categories: categorias,
    expenses: despesas,
    carInsurance: seguroResposta.data
      ? {
          isInsured: seguroResposta.data.is_insured,
          monthlyValueCents: seguroResposta.data.monthly_value_cents
        }
      : { isInsured: false, monthlyValueCents: 0 },
    hasCarInsuranceSettings: Boolean(seguroResposta.data)
  };
}

function chavePendencias(usuarioId) {
  return `${financeStorageKey}:outbox:${usuarioId}`;
}

function criarPendenciasVazias() {
  return {
    categoriesUpsert: {},
    categoriesDelete: [],
    expensesUpsert: {},
    expensesDelete: [],
    carInsuranceUpsert: null
  };
}

function lerPendencias(usuarioId) {
  const salvo = localStorage.getItem(chavePendencias(usuarioId));
  if (salvo === null) return criarPendenciasVazias();
  const pendencias = JSON.parse(salvo);
  if (!pendencias || typeof pendencias !== 'object' ||
      !pendencias.categoriesUpsert || !Array.isArray(pendencias.categoriesDelete) ||
      !pendencias.expensesUpsert || !Array.isArray(pendencias.expensesDelete)) {
    throw new Error('A fila local de sincronização está inválida. Seus dados locais foram preservados.');
  }
  if (pendencias.carInsuranceUpsert === undefined) pendencias.carInsuranceUpsert = null;
  if (pendencias.carInsuranceUpsert !== null &&
      (typeof pendencias.carInsuranceUpsert.isInsured !== 'boolean' ||
        !Number.isSafeInteger(pendencias.carInsuranceUpsert.monthlyValueCents) ||
        pendencias.carInsuranceUpsert.monthlyValueCents < 0)) {
    throw new Error('A fila de sincronização do seguro está inválida. Seus dados locais foram preservados.');
  }
  return pendencias;
}

function salvarPendencias(usuarioId, pendencias) {
  const vazias = !Object.keys(pendencias.categoriesUpsert).length &&
    !pendencias.categoriesDelete.length &&
    !Object.keys(pendencias.expensesUpsert).length &&
    !pendencias.expensesDelete.length &&
    pendencias.carInsuranceUpsert === null;
  if (vazias) localStorage.removeItem(chavePendencias(usuarioId));
  else localStorage.setItem(chavePendencias(usuarioId), JSON.stringify(pendencias));
}

function criarDeltaFinanceiro(instantaneo, anterior) {
  const categoriasAnteriores = new Map(anterior.categories.map(categoria => [categoria.id, categoria]));
  const despesasAnteriores = new Map(anterior.expenses.map(despesa => [despesa.id, despesa]));
  return {
    categoriesUpsert: instantaneo.categories.filter(categoria => {
      const antiga = categoriasAnteriores.get(categoria.id);
      return !antiga || antiga.name !== categoria.name || antiga.limitCents !== categoria.limitCents;
    }),
    categoriesDelete: anterior.categories
      .filter(categoria => !instantaneo.categories.some(atual => atual.id === categoria.id))
      .map(categoria => categoria.id),
    expensesUpsert: instantaneo.expenses.filter(despesa => {
      const antiga = despesasAnteriores.get(despesa.id);
      return !antiga ||
        antiga.categoryId !== despesa.categoryId ||
        antiga.description !== despesa.description ||
        antiga.amountCents !== despesa.amountCents ||
        antiga.date !== despesa.date;
    }),
    expensesDelete: anterior.expenses
      .filter(despesa => !instantaneo.expenses.some(atual => atual.id === despesa.id))
      .map(despesa => despesa.id),
    carInsuranceUpsert: JSON.stringify(instantaneo.carInsurance) === JSON.stringify(anterior.carInsurance)
      ? null
      : instantaneo.carInsurance
  };
}

function adicionarDeltaPendencias(pendencias, delta) {
  delta.categoriesUpsert.forEach(categoria => {
    pendencias.categoriesUpsert[categoria.id] = categoria;
    pendencias.categoriesDelete = pendencias.categoriesDelete.filter(id => id !== categoria.id);
  });
  delta.categoriesDelete.forEach(id => {
    delete pendencias.categoriesUpsert[id];
    if (!pendencias.categoriesDelete.includes(id)) pendencias.categoriesDelete.push(id);
  });
  delta.expensesUpsert.forEach(despesa => {
    pendencias.expensesUpsert[despesa.id] = despesa;
    pendencias.expensesDelete = pendencias.expensesDelete.filter(id => id !== despesa.id);
  });
  delta.expensesDelete.forEach(id => {
    delete pendencias.expensesUpsert[id];
    if (!pendencias.expensesDelete.includes(id)) pendencias.expensesDelete.push(id);
  });
  if (delta.carInsuranceUpsert) pendencias.carInsuranceUpsert = delta.carInsuranceUpsert;
}

function aplicarPendencias(dados, pendencias) {
  const categorias = new Map(dados.categories.map(categoria => [categoria.id, categoria]));
  pendencias.categoriesDelete.forEach(id => categorias.delete(id));
  Object.values(pendencias.categoriesUpsert).forEach(categoria => categorias.set(categoria.id, categoria));

  const despesas = new Map(dados.expenses.map(despesa => [despesa.id, despesa]));
  pendencias.expensesDelete.forEach(id => despesas.delete(id));
  Object.values(pendencias.expensesUpsert).forEach(despesa => despesas.set(despesa.id, despesa));
  return {
    categories: [...categorias.values()],
    expenses: [...despesas.values()],
    carInsurance: pendencias.carInsuranceUpsert || dados.carInsurance || { isInsured: false, monthlyValueCents: 0 }
  };
}

async function enviarPendencia(tipo, valor, usuario) {
  if (tipo === 'categoryUpsert') {
    const { error } = await clienteSupabase.from('finance_categories').upsert({
      id: valor.id,
      user_id: usuario.id,
      name: valor.name,
      monthly_limit_cents: valor.limitCents
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (tipo === 'categoryDelete') {
    const { error } = await clienteSupabase.from('finance_categories').delete().eq('id', valor);
    if (error) throw error;
  } else if (tipo === 'expenseUpsert') {
    const { error } = await clienteSupabase.from('finance_expenses').upsert({
      id: valor.id,
      user_id: usuario.id,
      category_id: valor.categoryId,
      description: valor.description,
      amount_cents: valor.amountCents,
      spent_on: valor.date
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (tipo === 'carInsuranceUpsert') {
    const { error } = await clienteSupabase.from('car_insurance_settings').upsert({
      user_id: usuario.id,
      is_insured: valor.isInsured,
      monthly_value_cents: valor.monthlyValueCents
    }, { onConflict: 'user_id' });
    if (error) throw error;
  } else {
    const { error } = await clienteSupabase.from('finance_expenses').delete().eq('id', valor);
    if (error) throw error;
  }
}

async function processarPendencias(usuario) {
  while (true) {
    const pendencias = lerPendencias(usuario.id);
    let tipo = '';
    let valor;
    let identificador = '';
    if (Object.keys(pendencias.categoriesUpsert).length) {
      tipo = 'categoryUpsert';
      [identificador, valor] = Object.entries(pendencias.categoriesUpsert)[0];
    } else if (pendencias.expensesDelete.length) {
      tipo = 'expenseDelete';
      [valor] = pendencias.expensesDelete;
      identificador = valor;
    } else if (pendencias.carInsuranceUpsert) {
      tipo = 'carInsuranceUpsert';
      valor = pendencias.carInsuranceUpsert;
      identificador = 'carInsuranceUpsert';
    } else if (Object.keys(pendencias.expensesUpsert).length) {
      tipo = 'expenseUpsert';
      [identificador, valor] = Object.entries(pendencias.expensesUpsert)[0];
    } else if (pendencias.categoriesDelete.length) {
      tipo = 'categoryDelete';
      [valor] = pendencias.categoriesDelete;
      identificador = valor;
    } else {
      return true;
    }

    await enviarPendencia(tipo, valor, usuario);
    const atualizadas = lerPendencias(usuario.id);
    if (tipo === 'categoryUpsert' &&
        JSON.stringify(atualizadas.categoriesUpsert[identificador]) === JSON.stringify(valor)) {
      delete atualizadas.categoriesUpsert[identificador];
    } else if (tipo === 'categoryDelete' && atualizadas.categoriesDelete.includes(identificador)) {
      atualizadas.categoriesDelete = atualizadas.categoriesDelete.filter(id => id !== identificador);
    } else if (tipo === 'expenseUpsert' &&
        JSON.stringify(atualizadas.expensesUpsert[identificador]) === JSON.stringify(valor)) {
      delete atualizadas.expensesUpsert[identificador];
    } else if (tipo === 'carInsuranceUpsert' &&
        JSON.stringify(atualizadas.carInsuranceUpsert) === JSON.stringify(valor)) {
      atualizadas.carInsuranceUpsert = null;
    } else if (tipo === 'expenseDelete' && atualizadas.expensesDelete.includes(identificador)) {
      atualizadas.expensesDelete = atualizadas.expensesDelete.filter(id => id !== identificador);
    }
    salvarPendencias(usuario.id, atualizadas);
  }
}

function agendarProcessamentoPendencias(usuario) {
  filaDeSincronizacao = filaDeSincronizacao.then(async () => {
    if (!usuario) return false;
    if (!clienteSupabase) {
      if (usuarioSupabase?.id === usuario.id) {
        definirStatusFinanceiro('Salvo neste aparelho. A sincronização será retomada quando o app puder se conectar ao Supabase.');
      }
      return false;
    }
    document.getElementById('financeStatus').textContent = 'Sincronizando com o Supabase...';
    try {
      await processarPendencias(usuario);
      if (usuarioSupabase?.id === usuario.id) {
        definirStatusFinanceiro('Alterações salvas e sincronizadas com sua conta.');
      }
      return true;
    } catch (erro) {
      if (usuarioSupabase?.id === usuario.id) {
        definirStatusFinanceiro(`Não foi possível sincronizar. Os dados estão salvos neste aparelho e serão reenviados quando houver conexão. ${erro.message}`, true);
      }
      return false;
    }
  });
  return filaDeSincronizacao;
}

function enfileirarSincronizacao(instantaneo, anterior = { categories: [], expenses: [] }) {
  const usuario = usuarioSupabase;
  if (!usuario) return Promise.resolve(true);
  const delta = criarDeltaFinanceiro(instantaneo, anterior);
  const semAlteracoes = !delta.categoriesUpsert.length && !delta.categoriesDelete.length &&
    !delta.expensesUpsert.length && !delta.expensesDelete.length;
  if (semAlteracoes) return filaDeSincronizacao;

  try {
    const pendencias = lerPendencias(usuario.id);
    adicionarDeltaPendencias(pendencias, delta);
    localStorage.setItem(chavePendencias(usuario.id), JSON.stringify(pendencias));
  } catch (erro) {
    definirStatusFinanceiro(`Não foi possível guardar a sincronização pendente. Os dados atuais continuam salvos neste aparelho. ${erro.message}`, true);
    return Promise.resolve(false);
  }
  return agendarProcessamentoPendencias(usuario);
}

async function carregarContaSupabase(usuario) {
  const dadosLocais = carregarDadosFinanceiros(financeStorageKey);
  const chaveDaConta = `${financeStorageKey}:user:${usuario.id}`;
  const cacheDaContaExiste = localStorage.getItem(chaveDaConta) !== null;
  const cacheDaConta = cacheDaContaExiste ? carregarDadosFinanceiros(chaveDaConta) : null;
  const pendencias = lerPendencias(usuario.id);
  let dadosRemotos;
  try {
    dadosRemotos = await carregarDadosRemotos();
  } catch (erro) {
    if (!cacheDaConta) throw erro;
    usuarioSupabase = usuario;
    chaveArmazenamentoAtiva = chaveDaConta;
    dadosFinanceiros = aplicarPendencias(cacheDaConta, pendencias);
    localStorage.setItem(chaveArmazenamentoAtiva, JSON.stringify(dadosFinanceiros));
    localStorage.setItem(usuarioFinanceiroKey, JSON.stringify({ id: usuario.id, email: usuario.email || '' }));
    renderizarFinancas();
    atualizarInterfaceConta();
    definirStatusConta('Sem conexão com o Supabase. Mostrando seus dados salvos neste aparelho; a sincronização será retomada quando a conexão voltar.');
    return;
  }

  const temDadosRemotos = dadosRemotos.categories.length > 0 ||
    dadosRemotos.expenses.length > 0 ||
    dadosRemotos.hasCarInsuranceSettings;
  let baseDaConta = dadosRemotos;
  if (!dadosRemotos.hasCarInsuranceSettings && cacheDaConta) {
    baseDaConta.carInsurance = cacheDaConta.carInsurance;
  }

  if (!temDadosRemotos) {
    if (cacheDaConta) {
      baseDaConta = cacheDaConta;
    } else {
      const idsDeCategorias = new Map();
      baseDaConta = {
        categories: dadosLocais.categories.map(categoria => {
          const id = criarIdFinanceiro();
          idsDeCategorias.set(categoria.id, id);
          return { ...categoria, id };
        }),
        expenses: dadosLocais.expenses
          .filter(despesa => idsDeCategorias.has(despesa.categoryId))
          .map(despesa => ({
            ...despesa,
            id: criarIdFinanceiro(),
            categoryId: idsDeCategorias.get(despesa.categoryId)
          }))
      };
      baseDaConta.carInsurance = dadosLocais.carInsurance;
    }
  }

  const dadosDaConta = aplicarPendencias(baseDaConta, pendencias);
  usuarioSupabase = usuario;
  chaveArmazenamentoAtiva = chaveDaConta;
  dadosFinanceiros = dadosDaConta;
  localStorage.setItem(chaveArmazenamentoAtiva, JSON.stringify(dadosDaConta));
  localStorage.setItem(usuarioFinanceiroKey, JSON.stringify({ id: usuario.id, email: usuario.email || '' }));
  renderizarFinancas();
  atualizarInterfaceConta();

  if (!temDadosRemotos && (dadosDaConta.categories.length || dadosDaConta.expenses.length)) {
    const sincronizado = await enfileirarSincronizacao(dadosDaConta, { categories: [], expenses: [] });
    definirStatusConta(sincronizado
      ? 'Conta conectada. Os dados salvos neste aparelho foram sincronizados com sua conta.'
      : 'Conta conectada, mas seus dados ainda aguardam sincronização. Confira a mensagem da área Finanças.');
  } else {
    if (!dadosRemotos.hasCarInsuranceSettings &&
        JSON.stringify(dadosDaConta.carInsurance) !== JSON.stringify(dadosRemotos.carInsurance)) {
      await enfileirarSincronizacao(dadosDaConta, {
        categories: dadosDaConta.categories,
        expenses: dadosDaConta.expenses,
        carInsurance: dadosRemotos.carInsurance
      });
    }
    const temPendencias = Object.keys(pendencias.categoriesUpsert).length ||
      pendencias.categoriesDelete.length ||
      Object.keys(pendencias.expensesUpsert).length ||
      pendencias.expensesDelete.length ||
      pendencias.carInsuranceUpsert !== null;
    if (temPendencias) await agendarProcessamentoPendencias(usuario);
    definirStatusConta('Conta conectada. Seus dados foram carregados do Supabase.');
  }
}

function ativarModoLocal() {
  usuarioSupabase = null;
  chaveArmazenamentoAtiva = financeStorageKey;
  dadosFinanceiros = carregarDadosFinanceiros(financeStorageKey);
  localStorage.setItem(financeStorageKey, JSON.stringify(dadosFinanceiros));
  renderizarFinancas();
  atualizarInterfaceConta();
}

async function entrarNaConta(evento) {
  evento.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  document.getElementById('signInButton').disabled = true;
  document.getElementById('signUpButton').disabled = true;
  definirStatusConta('Entrando e carregando seus dados...');
  try {
    const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await carregarContaSupabase(data.user);
    document.getElementById('authPassword').value = '';
  } catch (erro) {
    definirStatusConta(`Não foi possível entrar. ${erro.message}`, true);
  } finally {
    document.getElementById('signInButton').disabled = false;
    document.getElementById('signUpButton').disabled = false;
  }
}

async function criarContaSupabase() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!document.getElementById('authForm').reportValidity()) return;
  document.getElementById('signInButton').disabled = true;
  document.getElementById('signUpButton').disabled = true;
  definirStatusConta('Criando sua conta...');
  try {
    const { data, error } = await clienteSupabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session && data.user) {
      await carregarContaSupabase(data.user);
      document.getElementById('authPassword').value = '';
    } else {
      definirStatusConta('Conta criada. Confirme seu e-mail antes de entrar.');
    }
  } catch (erro) {
    definirStatusConta(`Não foi possível criar a conta. ${erro.message}`, true);
  } finally {
    document.getElementById('signInButton').disabled = false;
    document.getElementById('signUpButton').disabled = false;
  }
}

async function sairDaConta() {
  try {
    if (!clienteSupabase) {
      localStorage.removeItem(usuarioFinanceiroKey);
      ativarModoLocal();
      definirStatusConta('Você saiu do modo offline. Os dados da conta continuam salvos neste aparelho.');
      return;
    }
    await filaDeSincronizacao;
    const { error } = await clienteSupabase.auth.signOut();
    if (error) throw error;
    localStorage.removeItem(usuarioFinanceiroKey);
    ativarModoLocal();
    definirStatusConta('Você saiu da conta. Os dados locais deste navegador continuam disponíveis.');
  } catch (erro) {
    definirStatusConta(`Não foi possível sair da conta. ${erro.message}`, true);
  }
}

async function atualizarDadosDaConta() {
  if (!usuarioSupabase || !clienteSupabase) return;
  const usuario = usuarioSupabase;
  const sincronizacaoAnteriorOk = await agendarProcessamentoPendencias(usuario);
  if (sincronizacaoAnteriorOk === false) return;
  try {
    const dadosRemotos = await carregarDadosRemotos();
    const atualizados = aplicarPendencias(dadosRemotos, lerPendencias(usuario.id));
    if (usuarioSupabase?.id !== usuario.id) return;
    dadosFinanceiros = atualizados;
    localStorage.setItem(chaveArmazenamentoAtiva, JSON.stringify(atualizados));
    renderizarFinancas();
    definirStatusFinanceiro('Dados atualizados com o Supabase.');
  } catch (erro) {
    definirStatusFinanceiro(`Não foi possível atualizar os dados da conta. ${erro.message}`, true);
  }
}

async function inicializarSupabase() {
  const configuracao = window.SUPABASE_CONFIG;
  if (!validarConfiguracaoSupabase(configuracao)) {
    atualizarInterfaceConta();
    return;
  }
  if (!window.supabase?.createClient) {
    try {
      const usuarioSalvo = JSON.parse(localStorage.getItem(usuarioFinanceiroKey));
      if (usuarioSalvo && typeof usuarioSalvo.id === 'string') {
        const chaveDaConta = `${financeStorageKey}:user:${usuarioSalvo.id}`;
        if (localStorage.getItem(chaveDaConta) !== null) {
          usuarioSupabase = usuarioSalvo;
          chaveArmazenamentoAtiva = chaveDaConta;
          dadosFinanceiros = aplicarPendencias(
            carregarDadosFinanceiros(chaveDaConta),
            lerPendencias(usuarioSalvo.id)
          );
          localStorage.setItem(chaveArmazenamentoAtiva, JSON.stringify(dadosFinanceiros));
          renderizarFinancas();
        }
      }
      atualizarInterfaceConta();
      definirStatusConta(usuarioSupabase
        ? 'Sem conexão com o serviço de autenticação. Seus dados locais estão disponíveis; reabra o app online para sincronizar.'
        : 'A biblioteca do Supabase não carregou. Verifique a conexão e recarregue a página.', !usuarioSupabase);
    } catch (erro) {
      definirStatusConta(`Não foi possível abrir os dados locais da conta. ${erro.message}`, true);
    }
    return;
  }

  try {
    clienteSupabase = window.supabase.createClient(configuracao.url, configuracao.anonKey);
    atualizarInterfaceConta();
    const { data, error } = await clienteSupabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await carregarContaSupabase(data.session.user);
  } catch (erro) {
    clienteSupabase = null;
    atualizarInterfaceConta();
    definirStatusConta(`Não foi possível restaurar a sessão. ${erro.message}`, true);
  }
}

function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function formatarDataFinanceira(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR');
}

function renderizarFinancas() {
  const mesSelecionado = document.getElementById('financeMonth').value;
  const categorias = dadosFinanceiros.categories;
  const despesasDoMes = dadosFinanceiros.expenses.filter(despesa => despesa.date.slice(0, 7) === mesSelecionado);
  const limitesTotais = categorias.reduce((total, categoria) => total + categoria.limitCents, 0);
  const gastosTotais = despesasDoMes.reduce((total, despesa) => total + despesa.amountCents, 0);

  document.getElementById('monthlyLimitTotal').textContent = formatoMoeda.format(limitesTotais / 100);
  document.getElementById('monthlySpentTotal').textContent = formatoMoeda.format(gastosTotais / 100);
  const saldoTotal = limitesTotais - gastosTotais;
  const saidaSaldoTotal = document.getElementById('monthlyRemainingTotal');
  saidaSaldoTotal.textContent = formatoMoeda.format(saldoTotal / 100);
  saidaSaldoTotal.classList.toggle('finance-negative-balance', saldoTotal < 0);
  renderizarSeguroCarro();

  const listaCategorias = document.getElementById('budgetCategories');
  listaCategorias.replaceChildren();
  if (categorias.length === 0) {
    listaCategorias.append(criarElemento('p', 'finance-empty', 'Adicione uma categoria para definir seu primeiro limite mensal.'));
  }

  categorias.forEach(categoria => {
    const gasto = despesasDoMes
      .filter(despesa => despesa.categoryId === categoria.id)
      .reduce((total, despesa) => total + despesa.amountCents, 0);
    const restante = categoria.limitCents - gasto;
    const percentual = Math.min(100, Math.round((gasto / categoria.limitCents) * 100));
    const card = criarElemento('article', `budget-card${restante < 0 ? ' budget-card-over' : ''}`);
    const cabecalho = criarElemento('div', 'budget-card-heading');
    cabecalho.append(
      criarElemento('h3', '', categoria.name),
      criarElemento('span', 'budget-limit', `Limite: ${formatoMoeda.format(categoria.limitCents / 100)}`)
    );

    const progresso = criarElemento('div', 'budget-progress');
    progresso.setAttribute('role', 'progressbar');
    progresso.setAttribute('aria-label', `Uso do limite de ${categoria.name}`);
    progresso.setAttribute('aria-valuemin', '0');
    progresso.setAttribute('aria-valuemax', '100');
    progresso.setAttribute('aria-valuenow', String(percentual));
    const barra = criarElemento('span', 'budget-progress-bar');
    barra.style.width = `${percentual}%`;
    progresso.append(barra);

    const textoRestante = restante >= 0
      ? `Restam ${formatoMoeda.format(restante / 100)}`
      : `Limite ultrapassado em ${formatoMoeda.format(Math.abs(restante) / 100)}`;
    const resumo = criarElemento('div', 'budget-card-summary');
    resumo.append(
      criarElemento('span', '', `Gasto: ${formatoMoeda.format(gasto / 100)}`),
      criarElemento('strong', restante < 0 ? 'budget-over-text' : '', textoRestante)
    );

    const formularioLimite = criarElemento('form', 'budget-limit-form');
    const rotulo = criarElemento('label', '', 'Novo limite mensal (R$)');
    const campoLimite = document.createElement('input');
    campoLimite.type = 'number';
    campoLimite.min = '0.01';
    campoLimite.step = '0.01';
    campoLimite.required = true;
    campoLimite.value = (categoria.limitCents / 100).toFixed(2);
    const eCategoriaCarro = categoria.name.trim().toLocaleLowerCase('pt-BR') === 'meu carro';
    if (eCategoriaCarro) campoLimite.max = String(limiteMensalCarroCentavos / 100);
    campoLimite.setAttribute('aria-label', `Novo limite mensal para ${categoria.name}`);
    rotulo.append(campoLimite);
    const salvarLimite = criarElemento('button', 'budget-update-button', 'Atualizar limite');
    salvarLimite.type = 'submit';
    formularioLimite.append(rotulo, salvarLimite);
    formularioLimite.addEventListener('submit', evento => {
      evento.preventDefault();
      const valor = Number(campoLimite.value);
      const limiteEmCentavos = Math.round(valor * 100);
      if (campoLimite.value.trim() === '' || !Number.isFinite(valor) || limiteEmCentavos <= 0 ||
          !Number.isSafeInteger(limiteEmCentavos)) {
        definirStatusFinanceiro('Informe um limite maior que zero, com até duas casas decimais.', true);
        campoLimite.focus();
        return;
      }
      if (eCategoriaCarro && limiteEmCentavos > limiteMensalCarroCentavos) {
        definirStatusFinanceiro('O limite mensal de “Meu carro” não pode ultrapassar R$ 200,00.', true);
        campoLimite.focus();
        return;
      }

      const novasCategorias = categorias.map(item =>
        item.id === categoria.id ? { ...item, limitCents: limiteEmCentavos } : item
      );
      if (salvarDadosFinanceiros({ ...dadosFinanceiros, categories: novasCategorias })) {
        renderizarFinancas();
        definirStatusFinanceiro(`Limite de "${categoria.name}" atualizado.`);
      }
    });

    card.append(cabecalho, progresso, resumo, formularioLimite);
    listaCategorias.append(card);
  });

  const seletorCategoria = document.getElementById('expenseCategory');
  const categoriaSelecionada = seletorCategoria.value;
  seletorCategoria.replaceChildren();
  if (categorias.length === 0) {
    seletorCategoria.append(new Option('Adicione uma categoria primeiro', ''));
    seletorCategoria.disabled = true;
  } else {
    seletorCategoria.disabled = false;
    seletorCategoria.append(new Option('Selecione uma categoria', ''));
    categorias.forEach(categoria => {
      seletorCategoria.append(new Option(categoria.name, categoria.id));
    });
    if (categorias.some(categoria => categoria.id === categoriaSelecionada)) {
      seletorCategoria.value = categoriaSelecionada;
    }
  }
  document.querySelector('#expenseForm button[type="submit"]').disabled = categorias.length === 0;

  const listaDespesas = document.getElementById('monthlyExpenses');
  listaDespesas.replaceChildren();
  if (despesasDoMes.length === 0) {
    listaDespesas.append(criarElemento('p', 'finance-empty', 'Nenhuma despesa registrada neste mês.'));
    return;
  }

  const lista = criarElemento('ul', 'expense-list');
  despesasDoMes
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(despesa => {
      const categoria = categorias.find(item => item.id === despesa.categoryId);
      const linha = criarElemento('li', 'expense-item');
      const detalhes = criarElemento('div', 'expense-details');
      detalhes.append(
        criarElemento('strong', '', despesa.description || categoria?.name || 'Despesa'),
        criarElemento('span', '', `${categoria?.name || 'Categoria removida'} · ${formatarDataFinanceira(despesa.date)}`)
      );
      const valor = criarElemento('strong', 'expense-value', formatoMoeda.format(despesa.amountCents / 100));
      const excluir = criarElemento('button', 'expense-delete-button', 'Excluir');
      excluir.type = 'button';
      excluir.setAttribute('aria-label', `Excluir despesa de ${formatoMoeda.format(despesa.amountCents / 100)}`);
      excluir.addEventListener('click', () => {
        const proximasDespesas = dadosFinanceiros.expenses.filter(item => item.id !== despesa.id);
        if (salvarDadosFinanceiros({ ...dadosFinanceiros, expenses: proximasDespesas })) {
          renderizarFinancas();
          definirStatusFinanceiro('Despesa excluída.');
        }
      });
      linha.append(detalhes, valor, excluir);
      lista.append(linha);
    });
  listaDespesas.append(lista);
}

function renderizarSeguroCarro() {
  const seguro = dadosFinanceiros.carInsurance || { isInsured: false, monthlyValueCents: 0 };
  const interruptor = document.getElementById('carInsuranceInsured');
  interruptor.checked = seguro.isInsured;
  interruptor.setAttribute('aria-checked', String(seguro.isInsured));
  document.getElementById('carInsuranceStatus').textContent = seguro.isInsured ? 'Segurado' : 'Não segurado';
  document.getElementById('carInsuranceValue').value = seguro.monthlyValueCents
    ? (seguro.monthlyValueCents / 100).toFixed(2)
    : '';
  document.getElementById('carInsuranceCurrentValue').textContent = seguro.monthlyValueCents
    ? formatoMoeda.format(seguro.monthlyValueCents / 100)
    : 'Não informado';
}

const formularioCategoria = document.getElementById('categoryForm');
const formularioDespesa = document.getElementById('expenseForm');
const formularioSeguroCarro = document.getElementById('carInsuranceForm');
const campoMesFinanceiro = document.getElementById('financeMonth');
const campoDataDespesa = document.getElementById('expenseDate');
campoMesFinanceiro.value = dataAtualLocal().slice(0, 7);
campoDataDespesa.value = dataAtualLocal();

try {
  dadosFinanceiros = carregarDadosFinanceiros();
  if (localStorage.getItem(financeStorageKey) === null) {
    localStorage.setItem(financeStorageKey, JSON.stringify(dadosFinanceiros));
  }
  renderizarFinancas();
} catch (erro) {
  definirStatusFinanceiro(`Não foi possível carregar os dados financeiros. ${erro.message}`, true);
  formularioCategoria.querySelectorAll('input, button').forEach(campo => { campo.disabled = true; });
  formularioDespesa.querySelectorAll('input, select, button').forEach(campo => { campo.disabled = true; });
  campoMesFinanceiro.disabled = true;
}

document.getElementById('authForm').addEventListener('submit', entrarNaConta);
document.getElementById('signUpButton').addEventListener('click', criarContaSupabase);
document.getElementById('signOutButton').addEventListener('click', sairDaConta);

formularioCategoria.addEventListener('submit', evento => {
  evento.preventDefault();
  const nome = document.getElementById('categoryName').value.trim();
  const valorLimite = Number(document.getElementById('categoryLimit').value);
  const limiteEmCentavos = Math.round(valorLimite * 100);
  if (!nome) {
    definirStatusFinanceiro('Informe o nome da categoria.', true);
    return;
  }
  if (!Number.isFinite(valorLimite) || limiteEmCentavos <= 0 || !Number.isSafeInteger(limiteEmCentavos)) {
    definirStatusFinanceiro('Informe um limite mensal maior que zero, com até duas casas decimais.', true);
    return;
  }
  if (nome.toLocaleLowerCase('pt-BR') === 'meu carro' && limiteEmCentavos > limiteMensalCarroCentavos) {
    definirStatusFinanceiro('O limite mensal de “Meu carro” não pode ultrapassar R$ 200,00.', true);
    return;
  }
  if (dadosFinanceiros.categories.some(categoria => categoria.name.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
    definirStatusFinanceiro('Já existe uma categoria com esse nome. Você pode atualizar o limite no cartão da categoria.', true);
    return;
  }

  const novaCategoria = { id: criarIdFinanceiro('category'), name: nome, limitCents: limiteEmCentavos };
  if (salvarDadosFinanceiros({ ...dadosFinanceiros, categories: [...dadosFinanceiros.categories, novaCategoria] })) {
    formularioCategoria.reset();
    renderizarFinancas();
    definirStatusFinanceiro(`Categoria "${nome}" adicionada.`);
  }
});

formularioSeguroCarro.addEventListener('submit', evento => {
  evento.preventDefault();
  const campoValor = document.getElementById('carInsuranceValue');
  const valor = Number(campoValor.value);
  const valorEmCentavos = Math.round(valor * 100);
  if (campoValor.value.trim() === '' || !Number.isFinite(valor) ||
      valorEmCentavos <= 0 || !Number.isSafeInteger(valorEmCentavos)) {
    document.getElementById('carInsuranceMessage').textContent =
      'Informe um valor mensal de seguro maior que zero, com até duas casas decimais.';
    document.getElementById('carInsuranceMessage').classList.add('finance-status-error');
    return;
  }

  const proximosDados = {
    ...dadosFinanceiros,
    carInsurance: { ...dadosFinanceiros.carInsurance, monthlyValueCents: valorEmCentavos }
  };
  if (salvarDadosFinanceiros(proximosDados)) {
    renderizarSeguroCarro();
    const mensagem = document.getElementById('carInsuranceMessage');
    mensagem.textContent = 'Valor atual do seguro salvo. Ele não entra na cota do carro.';
    mensagem.classList.remove('finance-status-error');
  }
});

document.getElementById('carInsuranceInsured').addEventListener('change', evento => {
  const proximosDados = {
    ...dadosFinanceiros,
    carInsurance: { ...dadosFinanceiros.carInsurance, isInsured: evento.currentTarget.checked }
  };
  if (salvarDadosFinanceiros(proximosDados)) {
    renderizarSeguroCarro();
    const mensagem = document.getElementById('carInsuranceMessage');
    mensagem.textContent = proximosDados.carInsurance.isInsured
      ? 'Seguro marcado como ativo.'
      : 'Carro marcado como não segurado.';
    mensagem.classList.remove('finance-status-error');
  } else {
    renderizarSeguroCarro();
  }
});

formularioDespesa.addEventListener('submit', evento => {
  evento.preventDefault();
  const categoryId = document.getElementById('expenseCategory').value;
  const descricao = document.getElementById('expenseDescription').value.trim();
  const valor = Number(document.getElementById('expenseAmount').value);
  const data = campoDataDespesa.value;
  const valorEmCentavos = Math.round(valor * 100);
  if (!dadosFinanceiros.categories.some(categoria => categoria.id === categoryId)) {
    definirStatusFinanceiro('Selecione uma categoria válida para a despesa.', true);
    return;
  }
  if (!Number.isFinite(valor) || valorEmCentavos <= 0 || !Number.isSafeInteger(valorEmCentavos)) {
    definirStatusFinanceiro('Informe um valor de despesa maior que zero, com até duas casas decimais.', true);
    return;
  }
  if (!dataFinanceiraValida(data)) {
    definirStatusFinanceiro('Informe uma data válida para a despesa.', true);
    return;
  }

  const novaDespesa = {
    id: criarIdFinanceiro('expense'),
    categoryId,
    description: descricao,
    amountCents: valorEmCentavos,
    date: data
  };
  if (salvarDadosFinanceiros({ ...dadosFinanceiros, expenses: [...dadosFinanceiros.expenses, novaDespesa] })) {
    formularioDespesa.reset();
    document.getElementById('expenseDescriptionLabel').textContent = 'Descrição (opcional)';
    document.getElementById('expenseDescription').required = false;
    document.getElementById('expenseDescription').placeholder = 'Ex.: Combustível';
    campoDataDespesa.value = dataAtualLocal();
    renderizarFinancas();
    definirStatusFinanceiro('Despesa registrada.');
  }
});

campoMesFinanceiro.addEventListener('change', () => {
  const hoje = dataAtualLocal();
  campoDataDespesa.value = campoMesFinanceiro.value === hoje.slice(0, 7)
    ? hoje
    : `${campoMesFinanceiro.value}-01`;
  renderizarFinancas();
});

document.querySelectorAll('[data-expense-template]').forEach(botao => {
  botao.addEventListener('click', () => {
    const categoriaCarro = dadosFinanceiros.categories.find(categoria =>
      categoria.name.trim().toLocaleLowerCase('pt-BR') === 'meu carro'
    );
    if (!categoriaCarro) {
      definirStatusFinanceiro('Adicione a categoria “Meu carro” com limite de até R$ 200,00 para usar esta despesa rápida.', true);
      return;
    }
    document.getElementById('expenseCategory').value = categoriaCarro.id;
    const campoDescricao = document.getElementById('expenseDescription');
    const eManutencao = botao.dataset.expenseTemplate === 'Manutenção';
    document.getElementById('expenseDescriptionLabel').textContent =
      eManutencao ? 'Descrição da manutenção' : 'Descrição (opcional)';
    campoDescricao.required = eManutencao;
    campoDescricao.placeholder = eManutencao
      ? 'Ex.: troca de óleo ou reparo nos freios'
      : 'Ex.: Combustível';
    campoDescricao.value = eManutencao ? '' : botao.dataset.expenseTemplate;
    campoDataDespesa.value = campoMesFinanceiro.value === dataAtualLocal().slice(0, 7)
      ? dataAtualLocal()
      : `${campoMesFinanceiro.value}-01`;
    (eManutencao ? campoDescricao : document.getElementById('expenseAmount')).focus();
    definirStatusFinanceiro(eManutencao
      ? 'Descreva o serviço de manutenção e informe o valor para lançar na cota do carro.'
      : 'Combustível selecionado. Informe o valor para lançar na cota do carro.');
  });
});

document.getElementById('openCarInsurance').addEventListener('click', () => {
  const cartaoSeguro = document.getElementById('carInsuranceCard');
  cartaoSeguro.scrollIntoView({ behavior: 'auto', block: 'center' });
  document.getElementById('carInsuranceInsured').focus({ preventScroll: true });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') atualizarDadosDaConta();
});

window.addEventListener('online', () => {
  if (usuarioSupabase) atualizarDadosDaConta();
});

inicializarSupabase();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js')
    .catch(erro => console.error('Não foi possível registrar o app instalável:', erro));
}

document.querySelectorAll('[data-open-simulator]').forEach(botao => {
  botao.addEventListener('click', () => {
    const simulador = botao.dataset.openSimulator;
    const telaInicial = document.getElementById('dashboardView');
    const simuladorExcel = document.getElementById('excelSimulator');
    const simuladorMatematica = document.getElementById('mathSimulator');
    const telaFinancas = document.getElementById('financeView');
    const abrirExcel = simulador === 'excel';
    const abrirMatematica = simulador === 'matematica';
    const abrirFinancas = simulador === 'financas';

    telaInicial.hidden = abrirExcel || abrirMatematica || abrirFinancas;
    simuladorExcel.hidden = !abrirExcel;
    simuladorMatematica.hidden = !abrirMatematica;
    telaFinancas.hidden = !abrirFinancas;
    document.querySelectorAll('[data-open-simulator]').forEach(opcao => {
      opcao.setAttribute('aria-current', opcao === botao ? 'page' : 'false');
    });

    if (abrirExcel) {
      document.title = 'Simulado Excel - Treino de Fórmulas';
    } else if (abrirMatematica) {
      document.title = 'Simulado Matemática - Contas passo a passo';
    } else if (abrirFinancas) {
      document.title = 'Finanças - Painel de estudos';
    } else {
      document.title = 'Painel de estudos e finanças';
    }
  });
});

gerarProblema();
mostrarCelulaSelecionada(document.getElementById('cellA1'));
carregarPreset('SE1');
