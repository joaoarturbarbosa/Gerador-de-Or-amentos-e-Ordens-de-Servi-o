"use strict";

/* =========================================================
   Gerador de Orçamentos e Ordens de Serviço
   Organização do arquivo:
     1. Constantes
     2. Dinheiro: conversão e formatação (sempre em CENTAVOS)
     3. Cálculos
     4. Validação
     5. localStorage
     6. Estado da aplicação
     7. Leitura e escrita do formulário
     8. Desenho da tela (itens, totais, prévia, lista)
     9. Ações (botões)
    10. Inicialização
    11. Exportação para os testes (não afeta o navegador)
   ========================================================= */


/* ---------- 1. CONSTANTES ---------- */

const CHAVE_ORCAMENTOS = "gerador_orcamentos_v1";
const CHAVE_EMPRESA = "gerador_empresa_v1";
const CHAVE_CONTADOR = "gerador_contador_v1";

// Limites escolhidos para que os números inteiros nunca passem do
// limite seguro do JavaScript (Number.MAX_SAFE_INTEGER ≈ 9 quadrilhões).
const MAX_ITENS = 50;
const MAX_QUANTIDADE = 1000;
const MAX_PRECO_CENTAVOS = 10000000; // R$ 100.000,00

const NOMES_STATUS = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" };
const NOMES_TIPO = { orcamento: "Orçamento", os: "Ordem de Serviço" };
const PREFIXOS_ID = { orcamento: "ORC", os: "OS" };


/* ---------- 2. DINHEIRO ----------
   Regra de ouro: nunca guardamos "12.50" (decimal). Guardamos 1250 (centavos).
   Assim 0,10 + 0,20 dá exatamente 0,30, sem o erro de ponto flutuante. */

// Converte texto digitado em "centésimos" (inteiro). Devolve null se for inválido.
//   "1.234,56" -> 123456     "10" -> 1000     "10,5" -> 1050     "12.5" -> 1250
// Serve para reais (centavos) e para percentuais (centésimos de %: "10,5" -> 1050).
function textoParaCentesimos(texto) {
  const t = String(texto).trim();
  if (t === "") return null;

  const formatoBrasileiro = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/; // 1.234,56 ou 1234,56
  const formatoComPonto = /^\d+\.\d{1,2}$/;                          // 1234.56

  let parteInteira;
  let parteDecimal = "";

  if (formatoBrasileiro.test(t)) {
    const partes = t.split(",");
    parteInteira = partes[0].replace(/\./g, ""); // tira os pontos de milhar
    parteDecimal = partes[1] || "";
  } else if (formatoComPonto.test(t)) {
    const partes = t.split(".");
    parteInteira = partes[0];
    parteDecimal = partes[1];
  } else {
    return null; // letras, sinal negativo, vírgulas repetidas etc.
  }

  parteDecimal = parteDecimal.padEnd(2, "0"); // "5" vira "50"
  return Number(parteInteira) * 100 + Number(parteDecimal);
}

// 123456 -> "R$ 1.234,56"
function formatarMoeda(centavos) {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, "0");
  const reaisComPontos = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sinal + "R$ " + reaisComPontos + "," + resto;
}

// 1050 -> "10,5%"     1000 -> "10%"     1255 -> "12,55%"
function formatarPercentual(centesimos) {
  const inteiro = Math.floor(centesimos / 100);
  const resto = centesimos % 100;
  if (resto === 0) return inteiro + "%";
  let decimais = String(resto).padStart(2, "0");
  if (decimais.endsWith("0")) decimais = decimais.slice(0, 1);
  return inteiro + "," + decimais + "%";
}

// 1250 -> "12,50" (para devolver o valor a um campo de texto)
function centesimosParaTexto(valor) {
  return Math.floor(valor / 100) + "," + String(valor % 100).padStart(2, "0");
}


/* ---------- 3. CÁLCULOS ---------- */

function calcularSubtotalItem(item) {
  return item.quantidade * item.precoUnitarioCentavos;
}

// desconto = { tipo: "valor" | "percentual", valor: inteiro }
//   tipo "valor":      valor em centavos
//   tipo "percentual": valor em centésimos de % (10% = 1000)
function calcularTotais(listaItens, desconto) {
  let subtotal = 0;
  for (const item of listaItens) {
    subtotal += calcularSubtotalItem(item);
  }

  let descontoCentavos = 0;
  if (desconto.tipo === "percentual") {
    // subtotal * (valor / 10000), arredondado para o centavo mais próximo
    // usando só inteiros: somar metade do divisor (5000) e cortar a parte decimal.
    descontoCentavos = Math.floor((subtotal * desconto.valor + 5000) / 10000);
  } else {
    descontoCentavos = desconto.valor;
  }

  // Rede de segurança: o desconto nunca pode passar do subtotal.
  if (descontoCentavos > subtotal) descontoCentavos = subtotal;
  if (descontoCentavos < 0) descontoCentavos = 0;

  return {
    subtotal: subtotal,
    desconto: descontoCentavos,
    total: subtotal - descontoCentavos
  };
}


/* ---------- 4. VALIDAÇÃO ----------
   Cada função devolve uma lista de mensagens de erro (vazia = tudo certo). */

function validarItem(descricao, quantidadeTexto, precoTexto) {
  const erros = [];
  const desc = descricao.trim();
  const qt = quantidadeTexto.trim();
  const preco = precoTexto.trim();
  let quantidade = null;
  let precoCentavos = null;

  if (desc === "") {
    erros.push("Informe a descrição do item.");
  } else if (desc.length > 120) {
    erros.push("A descrição pode ter no máximo 120 caracteres.");
  }

  if (qt === "") {
    erros.push("Informe a quantidade.");
  } else if (!/^\d+$/.test(qt)) {
    erros.push("A quantidade deve ser um número inteiro, sem sinal de negativo, vírgula ou letras.");
  } else {
    quantidade = Number(qt);
    if (quantidade < 1 || quantidade > MAX_QUANTIDADE) {
      erros.push("A quantidade deve estar entre 1 e " + MAX_QUANTIDADE + ".");
      quantidade = null;
    }
  }

  if (preco === "") {
    erros.push("Informe o preço unitário.");
  } else {
    precoCentavos = textoParaCentesimos(preco);
    if (precoCentavos === null) {
      erros.push("Preço inválido. Use apenas números positivos, como 1234,56.");
    } else if (precoCentavos < 1 || precoCentavos > MAX_PRECO_CENTAVOS) {
      erros.push("O preço deve estar entre R$ 0,01 e " + formatarMoeda(MAX_PRECO_CENTAVOS) + ".");
      precoCentavos = null;
    }
  }

  if (erros.length > 0) return { erros: erros, item: null };
  return {
    erros: [],
    item: { descricao: desc, quantidade: quantidade, precoUnitarioCentavos: precoCentavos }
  };
}

// Interpreta o campo de desconto. Em caso de erro, devolve desconto zero + mensagem.
function interpretarDesconto(tipo, texto, subtotal) {
  const semDesconto = { tipo: tipo, valor: 0 };
  if (texto.trim() === "") return { desconto: semDesconto, erro: null };

  const valor = textoParaCentesimos(texto);
  if (valor === null) {
    return { desconto: semDesconto, erro: "Desconto inválido. Use apenas números positivos, como 10 ou 12,50." };
  }
  if (tipo === "percentual" && valor > 10000) {
    return { desconto: semDesconto, erro: "O desconto percentual não pode passar de 100%." };
  }
  if (tipo === "valor" && valor > subtotal) {
    return {
      desconto: semDesconto,
      erro: "O desconto (" + formatarMoeda(valor) + ") não pode ser maior que o subtotal (" + formatarMoeda(subtotal) + ")."
    };
  }
  return { desconto: { tipo: tipo, valor: valor }, erro: null };
}

function emailValido(email) {
  return email === "" || /^\S+@\S+\.\S+$/.test(email);
}

// Valida o orçamento inteiro antes de salvar.
function validarOrcamento(orc) {
  const erros = [];

  if (orc.empresa.nome === "") erros.push("Informe o nome da sua empresa.");
  if (orc.cliente.nome === "") erros.push("Informe o nome do cliente.");
  if (!emailValido(orc.empresa.email)) erros.push("O e-mail da empresa parece inválido.");
  if (!emailValido(orc.cliente.email)) erros.push("O e-mail do cliente parece inválido.");

  if (orc.itens.length === 0) {
    erros.push("Adicione pelo menos um produto ou serviço.");
  }
  for (const item of orc.itens) {
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
      erros.push("Há um item com quantidade inválida.");
      break;
    }
  }

  const totais = calcularTotais(orc.itens, orc.desconto);
  if (totais.total < 0) erros.push("O total não pode ser negativo.");

  return erros;
}

// Verifica se um objeto lido do localStorage tem o formato esperado.
function orcamentoValido(o) {
  return Boolean(
    o && typeof o === "object" &&
    typeof o.id === "string" &&
    Array.isArray(o.itens) &&
    o.empresa && o.cliente && o.desconto &&
    NOMES_STATUS[o.status] && NOMES_TIPO[o.tipoDocumento] &&
    o.itens.every(function (i) {
      return Number.isInteger(i.quantidade) && Number.isInteger(i.precoUnitarioCentavos);
    })
  );
}


/* ---------- 5. LOCALSTORAGE ----------
   O navegador só guarda TEXTO. Por isso usamos JSON.stringify ao salvar
   e JSON.parse ao ler. Tudo fica dentro de try/catch porque o
   armazenamento pode estar bloqueado, cheio ou conter dados corrompidos. */

function lerJSON(chave, padrao) {
  try {
    const texto = localStorage.getItem(chave);
    if (texto === null) return padrao;
    return JSON.parse(texto);
  } catch (erro) {
    return padrao;
  }
}

function gravarJSON(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (erro) {
    return false;
  }
}

function carregarOrcamentos() {
  const dados = lerJSON(CHAVE_ORCAMENTOS, []);
  if (!Array.isArray(dados)) return [];
  return dados.filter(orcamentoValido);
}

function salvarOrcamentos(lista) {
  return gravarJSON(CHAVE_ORCAMENTOS, lista);
}

// Gera "ORC-2026-0001", "OS-2026-0002"... A numeração nunca reaproveita
// um número, mesmo que o documento seja excluído.
function gerarIdentificador(tipoDocumento, listaExistente, ano) {
  let contador = Number(lerJSON(CHAVE_CONTADOR, 0));
  if (!Number.isInteger(contador) || contador < 0) contador = 0;

  // Proteção: se o contador se perdeu, continua depois do maior número já usado.
  for (const o of listaExistente) {
    const achado = /-(\d+)$/.exec(o.id);
    if (achado && Number(achado[1]) > contador) contador = Number(achado[1]);
  }

  contador += 1;
  gravarJSON(CHAVE_CONTADOR, contador);
  return PREFIXOS_ID[tipoDocumento] + "-" + ano + "-" + String(contador).padStart(4, "0");
}


/* ---------- 6. ESTADO DA APLICAÇÃO ---------- */

let itens = [];              // itens do documento que está na tela
let itemEmEdicaoId = null;   // id do item carregado no formulário de item
let proximoIdItem = 1;       // gerador simples de ids para itens
let orcamentoAtual = null;   // null = documento novo; objeto = documento salvo aberto
let modoConsulta = false;    // true = campos bloqueados
let alterado = false;        // true = há mudanças ainda não salvas


/* ---------- 7. LEITURA E ESCRITA DO FORMULÁRIO ---------- */

function elemento(id) { return document.getElementById(id); }
function valorDe(id) { return elemento(id).value; }

// Lê empresa ou cliente. prefixo = "empresa" ou "cliente".
function lerPessoa(prefixo) {
  return {
    nome: valorDe(prefixo + "-nome").trim(),
    documento: valorDe(prefixo + "-documento").trim(),
    telefone: valorDe(prefixo + "-telefone").trim(),
    email: valorDe(prefixo + "-email").trim(),
    endereco: valorDe(prefixo + "-endereco").trim()
  };
}

function escreverPessoa(prefixo, pessoa) {
  const p = pessoa || {};
  elemento(prefixo + "-nome").value = p.nome || "";
  elemento(prefixo + "-documento").value = p.documento || "";
  elemento(prefixo + "-telefone").value = p.telefone || "";
  elemento(prefixo + "-email").value = p.email || "";
  elemento(prefixo + "-endereco").value = p.endereco || "";
}

// Monta um objeto "rascunho" com tudo o que está na tela.
// Também devolve erros de campos que só existem na tela (desconto e validade).
function lerFormulario() {
  const errosDeCampo = [];
  const subtotal = calcularTotais(itens, { tipo: "valor", valor: 0 }).subtotal;

  const resultadoDesconto = interpretarDesconto(valorDe("desconto-tipo"), valorDe("desconto-valor"), subtotal);
  if (resultadoDesconto.erro) errosDeCampo.push(resultadoDesconto.erro);

  let validadeDias = 0;
  const textoValidade = valorDe("validade-dias").trim();
  if (textoValidade !== "") {
    if (/^\d{1,3}$/.test(textoValidade) && Number(textoValidade) <= 365) {
      validadeDias = Number(textoValidade);
    } else {
      errosDeCampo.push("A validade deve ser um número inteiro de 0 a 365 dias.");
    }
  }

  const rascunho = {
    id: orcamentoAtual ? orcamentoAtual.id : null,
    tipoDocumento: valorDe("tipo-documento"),
    status: valorDe("status"),
    criadoEm: orcamentoAtual ? orcamentoAtual.criadoEm : null,
    validadeDias: validadeDias,
    empresa: lerPessoa("empresa"),
    cliente: lerPessoa("cliente"),
    itens: itens.map(function (i) { return Object.assign({}, i); }),
    desconto: resultadoDesconto.desconto,
    observacoes: valorDe("observacoes").trim()
  };

  return { rascunho: rascunho, errosDeCampo: errosDeCampo, erroDesconto: resultadoDesconto.erro };
}

// Coloca um orçamento salvo de volta no formulário.
function carregarNoFormulario(orc) {
  elemento("tipo-documento").value = orc.tipoDocumento;
  elemento("status").value = orc.status;
  elemento("validade-dias").value = String(orc.validadeDias || 0);
  escreverPessoa("empresa", orc.empresa);
  escreverPessoa("cliente", orc.cliente);
  elemento("desconto-tipo").value = orc.desconto.tipo;
  elemento("desconto-valor").value = orc.desconto.valor > 0 ? centesimosParaTexto(orc.desconto.valor) : "";
  elemento("observacoes").value = orc.observacoes || "";

  itens = orc.itens.map(function (i) {
    return { id: i.id, descricao: i.descricao, quantidade: i.quantidade, precoUnitarioCentavos: i.precoUnitarioCentavos };
  });
  // Garante ids únicos mesmo se o dado salvo não tiver id.
  proximoIdItem = 1;
  for (const i of itens) {
    if (typeof i.id !== "number") i.id = proximoIdItem;
    if (i.id >= proximoIdItem) proximoIdItem = i.id + 1;
  }
  limparFormularioDeItem();
}

function limparFormularioDeItem() {
  elemento("item-descricao").value = "";
  elemento("item-quantidade").value = "1";
  elemento("item-preco").value = "";
  itemEmEdicaoId = null;
  elemento("btn-item").textContent = "Adicionar item";
  elemento("btn-cancelar-item").hidden = true;
  mostrarErros("erro-item", []);
}


/* ---------- 8. DESENHO DA TELA ----------
   Nunca usamos innerHTML com texto digitado pelo usuário (isso permitiria
   injetar HTML). Usamos textContent, que trata tudo como texto puro. */

function criar(tag, texto, classe) {
  const e = document.createElement(tag);
  if (texto !== undefined && texto !== null) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

function limpar(e) { e.textContent = ""; }

function mostrarErros(idLista, mensagens) {
  const lista = elemento(idLista);
  limpar(lista);
  for (const m of mensagens) lista.appendChild(criar("li", m));
  lista.hidden = mensagens.length === 0;
}

function formatarData(data) {
  return data.toLocaleDateString("pt-BR");
}

// Escreve texto num elemento; se vier vazio, usa o texto de exemplo em cinza.
function definirTexto(id, texto, exemplo) {
  const e = elemento(id);
  if (texto) {
    e.textContent = texto;
    e.classList.remove("vazio");
  } else {
    e.textContent = exemplo || "";
    if (exemplo) e.classList.add("vazio");
  }
}

function renderizarItens() {
  const corpo = elemento("tabela-itens-corpo");
  limpar(corpo);

  if (itens.length === 0) {
    const linha = criar("tr", null, "linha-vazia");
    const celula = criar("td", "Nenhum item adicionado ainda.");
    celula.colSpan = 5;
    linha.appendChild(celula);
    corpo.appendChild(linha);
    return;
  }

  for (const item of itens) {
    const linha = criar("tr", null, item.id === itemEmEdicaoId ? "linha-editando" : "");
    linha.appendChild(criar("td", item.descricao));
    linha.appendChild(criar("td", String(item.quantidade), "num"));
    linha.appendChild(criar("td", formatarMoeda(item.precoUnitarioCentavos), "num"));
    linha.appendChild(criar("td", formatarMoeda(calcularSubtotalItem(item)), "num"));

    const celulaAcoes = criar("td", null, "acoes-item");
    const btnEditar = criar("button", "Editar", "btn btn-secundario btn-pequeno");
    btnEditar.type = "button";
    btnEditar.dataset.acao = "editar-item";
    btnEditar.dataset.id = String(item.id);
    const btnRemover = criar("button", "Remover", "btn btn-perigo btn-pequeno");
    btnRemover.type = "button";
    btnRemover.dataset.acao = "remover-item";
    btnRemover.dataset.id = String(item.id);
    celulaAcoes.appendChild(btnEditar);
    celulaAcoes.appendChild(btnRemover);
    linha.appendChild(celulaAcoes);

    corpo.appendChild(linha);
  }
}

function rotuloDesconto(desconto) {
  return desconto.tipo === "percentual" ? "Desconto (" + formatarPercentual(desconto.valor) + ")" : "Desconto";
}

function renderizarPrevia(orc, totais) {
  definirTexto("doc-empresa-nome", orc.empresa.nome, "Nome da empresa");
  definirTexto("doc-empresa-documento", orc.empresa.documento ? "CPF/CNPJ: " + orc.empresa.documento : "");
  definirTexto("doc-empresa-endereco", orc.empresa.endereco);
  definirTexto("doc-empresa-telefone", orc.empresa.telefone ? "Tel.: " + orc.empresa.telefone : "");
  definirTexto("doc-empresa-email", orc.empresa.email);

  definirTexto("doc-tipo", NOMES_TIPO[orc.tipoDocumento]);
  definirTexto("doc-numero", orc.id ? "Nº " + orc.id : "", "Nº gerado ao salvar");

  const dataEmissao = orc.criadoEm ? new Date(orc.criadoEm) : new Date();
  definirTexto("doc-data", "Emissão: " + formatarData(dataEmissao));

  if (orc.tipoDocumento === "orcamento" && orc.validadeDias > 0) {
    const limite = new Date(dataEmissao.getTime());
    limite.setDate(limite.getDate() + orc.validadeDias);
    definirTexto("doc-validade", "Válido até " + formatarData(limite));
  } else {
    definirTexto("doc-validade", "");
  }

  const selo = elemento("doc-status");
  selo.textContent = NOMES_STATUS[orc.status];
  selo.className = "selo selo-" + orc.status;

  definirTexto("doc-cliente-nome", orc.cliente.nome, "Nome do cliente");
  definirTexto("doc-cliente-documento", orc.cliente.documento ? "CPF/CNPJ: " + orc.cliente.documento : "");
  definirTexto("doc-cliente-endereco", orc.cliente.endereco);
  definirTexto("doc-cliente-telefone", orc.cliente.telefone ? "Tel.: " + orc.cliente.telefone : "");
  definirTexto("doc-cliente-email", orc.cliente.email);

  const corpo = elemento("doc-itens");
  limpar(corpo);
  if (orc.itens.length === 0) {
    const linha = criar("tr", null, "linha-vazia");
    const celula = criar("td", "Nenhum item adicionado");
    celula.colSpan = 4;
    linha.appendChild(celula);
    corpo.appendChild(linha);
  }
  for (const item of orc.itens) {
    const linha = criar("tr");
    linha.appendChild(criar("td", item.descricao));
    linha.appendChild(criar("td", String(item.quantidade), "num"));
    linha.appendChild(criar("td", formatarMoeda(item.precoUnitarioCentavos), "num"));
    linha.appendChild(criar("td", formatarMoeda(calcularSubtotalItem(item)), "num"));
    corpo.appendChild(linha);
  }

  elemento("doc-subtotal").textContent = formatarMoeda(totais.subtotal);
  elemento("doc-linha-desconto").hidden = totais.desconto === 0;
  elemento("doc-rotulo-desconto").textContent = rotuloDesconto(orc.desconto);
  elemento("doc-desconto").textContent = "- " + formatarMoeda(totais.desconto);
  elemento("doc-total").textContent = formatarMoeda(totais.total);

  elemento("doc-obs").textContent = orc.observacoes;
  elemento("doc-bloco-obs").hidden = orc.observacoes === "";
}

// Atualiza tudo o que depende do formulário.
// A tabela de itens só é redesenhada quando os itens mudam (recriarTabela = true).
// Se ela fosse redesenhada a cada digitação, o botão "Editar" ou "Remover" poderia
// ser apagado entre o "apertar" e o "soltar" do mouse, e o clique seria perdido.
function atualizarTela(recriarTabela) {
  const leitura = lerFormulario();
  const totais = calcularTotais(leitura.rascunho.itens, leitura.rascunho.desconto);

  if (recriarTabela !== false) renderizarItens();

  elemento("resumo-subtotal").textContent = formatarMoeda(totais.subtotal);
  elemento("resumo-desconto").textContent = "- " + formatarMoeda(totais.desconto);
  elemento("resumo-total").textContent = formatarMoeda(totais.total);

  const erroDesconto = elemento("erro-desconto");
  erroDesconto.textContent = leitura.erroDesconto || "";
  erroDesconto.hidden = !leitura.erroDesconto;

  renderizarPrevia(leitura.rascunho, totais);
}

function renderizarLista() {
  const todos = carregarOrcamentos();
  const busca = valorDe("filtro-busca").trim().toLowerCase();
  const filtroStatus = valorDe("filtro-status");

  const filtrados = todos.filter(function (o) {
    const bateStatus = filtroStatus === "todos" || o.status === filtroStatus;
    const textoBusca = (o.id + " " + o.cliente.nome).toLowerCase();
    return bateStatus && textoBusca.includes(busca);
  });

  // Mais recentes primeiro
  filtrados.sort(function (a, b) { return (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""); });

  const lista = elemento("lista-salvos");
  limpar(lista);

  elemento("contagem-salvos").textContent =
    todos.length === 0
      ? "Nenhum documento salvo ainda. Preencha o formulário e clique em “Salvar orçamento”."
      : filtrados.length + " de " + todos.length + " documento(s) exibido(s).";

  for (const o of filtrados) {
    const totais = calcularTotais(o.itens, o.desconto);
    const li = criar("li", null, "item-salvo" + (orcamentoAtual && orcamentoAtual.id === o.id ? " item-salvo-aberto" : ""));

    const colunaInfo = criar("div");
    colunaInfo.appendChild(criar("p", o.id + " · " + NOMES_TIPO[o.tipoDocumento], "item-salvo-titulo"));
    colunaInfo.appendChild(criar("p", o.cliente.nome, "item-salvo-detalhe"));
    colunaInfo.appendChild(criar("p", "Atualizado em " + formatarData(new Date(o.atualizadoEm || o.criadoEm)), "item-salvo-detalhe"));

    const colunaValor = criar("div");
    colunaValor.appendChild(criar("p", formatarMoeda(totais.total), "item-salvo-total"));
    colunaValor.appendChild(criar("span", NOMES_STATUS[o.status], "selo selo-" + o.status));

    const colunaAcoes = criar("div", null, "item-salvo-acoes");
    const acoes = [
      ["consultar", "Consultar", "btn btn-secundario btn-pequeno"],
      ["editar", "Editar", "btn btn-secundario btn-pequeno"],
      ["excluir", "Excluir", "btn btn-perigo btn-pequeno"]
    ];
    for (const a of acoes) {
      const b = criar("button", a[1], a[2]);
      b.type = "button";
      b.dataset.acao = a[0];
      b.dataset.id = o.id;
      colunaAcoes.appendChild(b);
    }

    li.appendChild(colunaInfo);
    li.appendChild(colunaValor);
    li.appendChild(colunaAcoes);
    lista.appendChild(li);
  }
}

function atualizarModo() {
  elemento("campos").disabled = modoConsulta;
  elemento("btn-salvar").disabled = modoConsulta;
  elemento("aviso-consulta").hidden = !modoConsulta;
  elemento("tipo-documento").disabled = modoConsulta || orcamentoAtual !== null; // o tipo define o prefixo do número

  const aviso = elemento("aviso-edicao");
  if (!modoConsulta && orcamentoAtual) {
    aviso.hidden = false;
    aviso.textContent = "Editando " + orcamentoAtual.id + ". Clique em “Salvar orçamento” para guardar as alterações.";
  } else {
    aviso.hidden = true;
  }
  if (modoConsulta && orcamentoAtual) {
    elemento("aviso-consulta-texto").textContent = "Consultando " + orcamentoAtual.id + " (somente leitura).";
  }
  elemento("btn-salvar").textContent = orcamentoAtual ? "Salvar alterações" : "Salvar orçamento";
}

function mostrarMensagemGlobal(texto) {
  const e = elemento("msg-global");
  e.textContent = texto;
  e.hidden = texto === "";
}


/* ---------- 9. AÇÕES (BOTÕES) ---------- */

function aoEnviarItem(evento) {
  evento.preventDefault(); // não deixa o formulário recarregar a página

  const resultado = validarItem(valorDe("item-descricao"), valorDe("item-quantidade"), valorDe("item-preco"));
  if (resultado.erros.length > 0) {
    mostrarErros("erro-item", resultado.erros);
    return;
  }

  if (itemEmEdicaoId !== null) {
    const existente = itens.find(function (i) { return i.id === itemEmEdicaoId; });
    if (existente) {
      existente.descricao = resultado.item.descricao;
      existente.quantidade = resultado.item.quantidade;
      existente.precoUnitarioCentavos = resultado.item.precoUnitarioCentavos;
    }
  } else {
    if (itens.length >= MAX_ITENS) {
      mostrarErros("erro-item", ["Limite de " + MAX_ITENS + " itens por documento."]);
      return;
    }
    resultado.item.id = proximoIdItem;
    proximoIdItem += 1;
    itens.push(resultado.item);
  }

  limparFormularioDeItem();
  alterado = true;
  atualizarTela();
  elemento("item-descricao").focus();
}

function editarItem(id) {
  const item = itens.find(function (i) { return i.id === id; });
  if (!item) return;
  itemEmEdicaoId = id;
  elemento("item-descricao").value = item.descricao;
  elemento("item-quantidade").value = String(item.quantidade);
  elemento("item-preco").value = centesimosParaTexto(item.precoUnitarioCentavos);
  elemento("btn-item").textContent = "Salvar alterações do item";
  elemento("btn-cancelar-item").hidden = false;
  mostrarErros("erro-item", []);
  atualizarTela();
  elemento("item-descricao").focus();
}

function removerItem(id) {
  itens = itens.filter(function (i) { return i.id !== id; });
  if (itemEmEdicaoId === id) limparFormularioDeItem();
  alterado = true;
  atualizarTela();
}

function itemPendenteNoFormulario() {
  return itemEmEdicaoId !== null ||
    valorDe("item-descricao").trim() !== "" ||
    valorDe("item-preco").trim() !== "";
}

function aoSalvar() {
  mostrarMensagemGlobal("");
  const leitura = lerFormulario();
  const erros = leitura.errosDeCampo.slice();

  if (itemPendenteNoFormulario()) {
    erros.push("Há um item preenchido (ou em edição) que ainda não foi confirmado. Clique em “Adicionar item” ou “Cancelar edição”.");
  }
  erros.push.apply(erros, validarOrcamento(leitura.rascunho));

  if (erros.length > 0) {
    mostrarErros("erro-salvar", erros);
    return;
  }
  mostrarErros("erro-salvar", []);

  const lista = carregarOrcamentos();
  const agora = new Date().toISOString();
  const orc = leitura.rascunho;

  if (orcamentoAtual) {
    orc.id = orcamentoAtual.id;
    orc.criadoEm = orcamentoAtual.criadoEm;
    orc.atualizadoEm = agora;
    const posicao = lista.findIndex(function (o) { return o.id === orc.id; });
    if (posicao >= 0) lista[posicao] = orc; else lista.push(orc);
  } else {
    orc.id = gerarIdentificador(orc.tipoDocumento, lista, new Date().getFullYear());
    orc.criadoEm = agora;
    orc.atualizadoEm = agora;
    lista.push(orc);
  }

  if (!salvarOrcamentos(lista)) {
    mostrarErros("erro-salvar", ["Não foi possível salvar: o armazenamento do navegador está indisponível ou cheio."]);
    return;
  }

  orcamentoAtual = orc;
  alterado = false;
  atualizarModo();
  atualizarTela();
  renderizarLista();
  mostrarMensagemGlobal("Documento " + orc.id + " salvo com sucesso.");
}

function aoSalvarEmpresa() {
  const empresa = lerPessoa("empresa");
  const msg = elemento("msg-empresa");
  if (empresa.nome === "") {
    msg.textContent = "";
    mostrarErros("erro-salvar", ["Informe o nome da empresa antes de guardar os dados padrão."]);
    return;
  }
  if (!emailValido(empresa.email)) {
    mostrarErros("erro-salvar", ["O e-mail da empresa parece inválido."]);
    return;
  }
  mostrarErros("erro-salvar", []);
  msg.textContent = gravarJSON(CHAVE_EMPRESA, empresa)
    ? "Dados da empresa guardados."
    : "Não foi possível guardar (armazenamento indisponível).";
}

function novoDocumento(pedirConfirmacao) {
  if (pedirConfirmacao && alterado && !modoConsulta) {
    if (!window.confirm("Existem alterações não salvas. Descartar e começar um novo documento?")) return;
  }
  orcamentoAtual = null;
  modoConsulta = false;
  alterado = false;
  itens = [];
  proximoIdItem = 1;

  elemento("tipo-documento").value = "orcamento";
  elemento("status").value = "pendente";
  elemento("validade-dias").value = "15";
  escreverPessoa("cliente", null);
  escreverPessoa("empresa", lerJSON(CHAVE_EMPRESA, null)); // volta aos dados padrão
  elemento("desconto-tipo").value = "valor";
  elemento("desconto-valor").value = "";
  elemento("observacoes").value = "";
  limparFormularioDeItem();

  mostrarErros("erro-salvar", []);
  mostrarMensagemGlobal("");
  atualizarModo();
  atualizarTela();
  renderizarLista();
}

function abrirSalvo(id, somenteLeitura) {
  const orc = carregarOrcamentos().find(function (o) { return o.id === id; });
  if (!orc) return;

  if (alterado && !modoConsulta) {
    if (!window.confirm("Existem alterações não salvas. Descartá-las e abrir " + id + "?")) return;
  }

  orcamentoAtual = orc;
  modoConsulta = somenteLeitura;
  carregarNoFormulario(orc);
  alterado = false;
  mostrarErros("erro-salvar", []);
  mostrarMensagemGlobal("");
  atualizarModo();
  atualizarTela();
  renderizarLista();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function excluirSalvo(id) {
  if (!window.confirm("Excluir o documento " + id + "? Esta ação não pode ser desfeita.")) return;

  const lista = carregarOrcamentos().filter(function (o) { return o.id !== id; });
  if (!salvarOrcamentos(lista)) {
    mostrarErros("erro-salvar", ["Não foi possível excluir: armazenamento indisponível."]);
    return;
  }
  if (orcamentoAtual && orcamentoAtual.id === id) {
    novoDocumento(false);
  } else {
    renderizarLista();
  }
  mostrarMensagemGlobal("Documento " + id + " excluído.");
}

function aoImprimir() {
  const leitura = lerFormulario();
  if (leitura.rascunho.itens.length === 0) {
    mostrarErros("erro-salvar", ["Adicione pelo menos um item antes de imprimir."]);
    return;
  }
  mostrarErros("erro-salvar", []);

  // O nome do arquivo PDF sugerido pelo navegador vem do título da página.
  const tituloOriginal = document.title;
  const nomeBase = leitura.rascunho.id || NOMES_TIPO[leitura.rascunho.tipoDocumento];
  document.title = nomeBase + (leitura.rascunho.cliente.nome ? " - " + leitura.rascunho.cliente.nome : "");
  window.print();
  document.title = tituloOriginal;
}

// Um único "ouvinte" para os botões criados dinamicamente (tabela e lista).
function aoClicarEmAcao(evento) {
  const botao = evento.target.closest("button[data-acao]");
  if (!botao) return;
  const acao = botao.dataset.acao;

  if (acao === "editar-item") editarItem(Number(botao.dataset.id));
  else if (acao === "remover-item") removerItem(Number(botao.dataset.id));
  else if (acao === "consultar") abrirSalvo(botao.dataset.id, true);
  else if (acao === "editar") abrirSalvo(botao.dataset.id, false);
  else if (acao === "excluir") excluirSalvo(botao.dataset.id);
}


/* ---------- 10. INICIALIZAÇÃO ---------- */

function iniciar() {
  // Qualquer digitação no formulário atualiza prévia e totais.
  elemento("campos").addEventListener("input", function () { alterado = true; atualizarTela(false); });
  elemento("campos").addEventListener("change", function () { alterado = true; atualizarTela(false); });
  elemento("campos").addEventListener("click", aoClicarEmAcao);
  elemento("lista-salvos").addEventListener("click", aoClicarEmAcao);

  elemento("form-item").addEventListener("submit", aoEnviarItem);
  elemento("btn-cancelar-item").addEventListener("click", function () { limparFormularioDeItem(); atualizarTela(); });
  elemento("btn-salvar").addEventListener("click", aoSalvar);
  elemento("btn-salvar-empresa").addEventListener("click", aoSalvarEmpresa);
  elemento("btn-imprimir").addEventListener("click", aoImprimir);
  elemento("btn-novo").addEventListener("click", function () { novoDocumento(true); });
  elemento("btn-liberar-edicao").addEventListener("click", function () {
    modoConsulta = false;
    atualizarModo();
  });
  elemento("filtro-busca").addEventListener("input", renderizarLista);
  elemento("filtro-status").addEventListener("change", renderizarLista);

  novoDocumento(false);
}

if (typeof document !== "undefined") {
  iniciar();
}


/* ---------- 11. EXPORTAÇÃO PARA OS TESTES ----------
   No navegador "module" não existe, então este bloco é ignorado.
   No Node.js (testes/testes-logica.js) ele libera as funções para teste. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    textoParaCentesimos, formatarMoeda, formatarPercentual, centesimosParaTexto,
    calcularSubtotalItem, calcularTotais,
    validarItem, interpretarDesconto, validarOrcamento, orcamentoValido,
    gerarIdentificador, carregarOrcamentos, salvarOrcamentos,
    MAX_QUANTIDADE, MAX_PRECO_CENTAVOS, CHAVE_ORCAMENTOS, CHAVE_CONTADOR
  };
}