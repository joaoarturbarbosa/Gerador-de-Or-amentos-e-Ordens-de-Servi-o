"use strict";

/* Testes automáticos da lógica (cálculos, validação e localStorage).
   Como rodar (precisa do Node.js instalado):
       node testes/testes-logica.js
   Não precisa instalar nada. O localStorage é simulado por um objeto simples. */

const assert = require("assert");

// --- localStorage falso, só para os testes ---
const armazenamento = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(armazenamento, k) ? armazenamento[k] : null; },
  setItem: function (k, v) { armazenamento[k] = String(v); },
  removeItem: function (k) { delete armazenamento[k]; }
};
function zerarArmazenamento() { for (const k of Object.keys(armazenamento)) delete armazenamento[k]; }

const S = require("../script.js");

let passou = 0;
let falhou = 0;

function cenario(nome, funcao) {
  zerarArmazenamento();
  try {
    funcao();
    passou += 1;
    console.log("  OK   " + nome);
  } catch (erro) {
    falhou += 1;
    console.log("  FALHOU  " + nome + "\n         " + erro.message);
  }
}

function item(qtd, precoCentavos, descricao) {
  return { descricao: descricao || "Item", quantidade: qtd, precoUnitarioCentavos: precoCentavos };
}

function orcamentoBase(itens, desconto) {
  return {
    id: "ORC-2026-0001", tipoDocumento: "orcamento", status: "pendente",
    criadoEm: "2026-01-10T12:00:00.000Z", atualizadoEm: "2026-01-10T12:00:00.000Z",
    validadeDias: 15,
    empresa: { nome: "Oficina Teste", documento: "", telefone: "", email: "", endereco: "" },
    cliente: { nome: "Maria", documento: "", telefone: "", email: "", endereco: "" },
    itens: itens, desconto: desconto || { tipo: "valor", valor: 0 }, observacoes: ""
  };
}

console.log("\nTestes da lógica\n");

// 1
cenario("1. Precisão: R$ 0,10 + R$ 0,20 = R$ 0,30 exato (em decimal, 0.1 + 0.2 dá 0.30000000000000004)", function () {
  assert.notStrictEqual(0.1 + 0.2, 0.3, "confirma o problema do ponto flutuante");
  const t = S.calcularTotais([item(1, 10), item(1, 20)], { tipo: "valor", valor: 0 });
  assert.strictEqual(t.subtotal, 30);
  assert.strictEqual(t.total, 30);
  assert.strictEqual(S.formatarMoeda(t.total), "R$ 0,30");
});

// 2
cenario("2. Conversão de texto em centavos (formatos válidos)", function () {
  assert.strictEqual(S.textoParaCentesimos("10"), 1000);
  assert.strictEqual(S.textoParaCentesimos("10,5"), 1050);
  assert.strictEqual(S.textoParaCentesimos("10,50"), 1050);
  assert.strictEqual(S.textoParaCentesimos("1.234,56"), 123456);
  assert.strictEqual(S.textoParaCentesimos("1234.56"), 123456);
  assert.strictEqual(S.textoParaCentesimos("0,01"), 1);
  assert.strictEqual(S.textoParaCentesimos(" 7 "), 700);
});

// 3
cenario("3. Conversão rejeita entradas inválidas sem quebrar", function () {
  const invalidas = ["", "   ", "abc", "-5", "1,234", "1,2,3", "10,", ",50", "1e3", "R$ 10", "10,555", "--1"];
  for (const texto of invalidas) {
    assert.strictEqual(S.textoParaCentesimos(texto), null, "deveria rejeitar: '" + texto + "'");
  }
});

// 4
cenario("4. Vários itens: subtotais e total corretos", function () {
  const lista = [item(2, 15000), item(1, 4990), item(10, 250)]; // 300,00 + 49,90 + 25,00
  assert.strictEqual(S.calcularSubtotalItem(lista[0]), 30000);
  const t = S.calcularTotais(lista, { tipo: "valor", valor: 0 });
  assert.strictEqual(t.subtotal, 37490);
  assert.strictEqual(t.total, 37490);
});

// 5
cenario("5. Desconto em reais: subtotal R$ 374,90 - R$ 24,90 = R$ 350,00", function () {
  const lista = [item(2, 15000), item(1, 4990), item(10, 250)];
  const r = S.interpretarDesconto("valor", "24,90", 37490);
  assert.strictEqual(r.erro, null);
  const t = S.calcularTotais(lista, r.desconto);
  assert.strictEqual(t.desconto, 2490);
  assert.strictEqual(t.total, 35000);
});

// 6
cenario("6. Desconto percentual com arredondamento ao centavo", function () {
  // 10% de R$ 374,90 = 37,49
  let r = S.interpretarDesconto("percentual", "10", 37490);
  let t = S.calcularTotais([item(1, 37490)], r.desconto);
  assert.strictEqual(t.desconto, 3749);
  assert.strictEqual(t.total, 33741);
  // 12,5% de R$ 0,99 = 0,12375 -> 0,12
  r = S.interpretarDesconto("percentual", "12,5", 99);
  t = S.calcularTotais([item(1, 99)], r.desconto);
  assert.strictEqual(t.desconto, 12);
  // 50% de R$ 0,01 = 0,005 -> arredonda para 0,01 (metade para cima)
  r = S.interpretarDesconto("percentual", "50", 1);
  t = S.calcularTotais([item(1, 1)], r.desconto);
  assert.strictEqual(t.desconto, 1);
  assert.strictEqual(t.total, 0);
});

// 7
cenario("7. Desconto inválido é recusado (maior que subtotal, >100%, negativo, texto)", function () {
  assert.ok(S.interpretarDesconto("valor", "500,00", 37490).erro, "valor maior que o subtotal");
  assert.ok(S.interpretarDesconto("percentual", "100,01", 37490).erro, "percentual acima de 100");
  assert.ok(S.interpretarDesconto("percentual", "150", 37490).erro, "percentual 150");
  assert.ok(S.interpretarDesconto("valor", "-10", 37490).erro, "valor negativo");
  assert.ok(S.interpretarDesconto("valor", "dez", 37490).erro, "texto");
  assert.strictEqual(S.interpretarDesconto("valor", "", 37490).erro, null, "vazio = sem desconto");
  // Quando há erro, o desconto devolvido é zero (a tela continua funcionando)
  assert.strictEqual(S.interpretarDesconto("valor", "500,00", 37490).desconto.valor, 0);
});

// 8
cenario("8. Desconto de 100% ou igual ao subtotal zera o total, nunca fica negativo", function () {
  const lista = [item(1, 10000)];
  let t = S.calcularTotais(lista, S.interpretarDesconto("percentual", "100", 10000).desconto);
  assert.strictEqual(t.total, 0);
  t = S.calcularTotais(lista, S.interpretarDesconto("valor", "100,00", 10000).desconto);
  assert.strictEqual(t.total, 0);
  // Rede de segurança: mesmo um desconto forçado acima do subtotal é limitado
  t = S.calcularTotais(lista, { tipo: "valor", valor: 99999 });
  assert.strictEqual(t.total, 0);
  assert.ok(t.total >= 0);
});

// 9
cenario("9. Validação de item: quantidade negativa, zero, decimal, vazia, enorme", function () {
  const ruins = [
    ["Pintura", "-1", "10,00"], ["Pintura", "0", "10,00"], ["Pintura", "1,5", "10,00"],
    ["Pintura", "", "10,00"], ["Pintura", "abc", "10,00"], ["Pintura", String(S.MAX_QUANTIDADE + 1), "10,00"],
    ["", "1", "10,00"], ["   ", "1", "10,00"],
    ["Pintura", "1", ""], ["Pintura", "1", "-5"], ["Pintura", "1", "0"], ["Pintura", "1", "0,00"],
    ["Pintura", "1", "abc"], ["Pintura", "1", "9999999999"]
  ];
  for (const r of ruins) {
    const res = S.validarItem(r[0], r[1], r[2]);
    assert.ok(res.erros.length > 0 && res.item === null, "deveria recusar: " + JSON.stringify(r));
  }
  const boa = S.validarItem("  Pintura  ", "3", "1.250,50");
  assert.deepStrictEqual(boa.erros, []);
  assert.deepStrictEqual(boa.item, { descricao: "Pintura", quantidade: 3, precoUnitarioCentavos: 125050 });
});

// 10
cenario("10. Excluir item recalcula subtotal e total", function () {
  let lista = [item(1, 10000, "A"), item(2, 5000, "B"), item(1, 2500, "C")];
  assert.strictEqual(S.calcularTotais(lista, { tipo: "valor", valor: 0 }).total, 22500);
  lista = lista.filter(function (i) { return i.descricao !== "B"; });
  assert.strictEqual(S.calcularTotais(lista, { tipo: "valor", valor: 0 }).total, 12500);
  lista = [];
  assert.strictEqual(S.calcularTotais(lista, { tipo: "valor", valor: 0 }).total, 0);
});

// 11
cenario("11. Salvar e recuperar do localStorage; excluir um documento", function () {
  const a = orcamentoBase([item(1, 10000)]);
  const b = Object.assign(orcamentoBase([item(2, 500)]), { id: "ORC-2026-0002" });
  assert.strictEqual(S.salvarOrcamentos([a, b]), true);

  // "Recarregar a página" = ler de novo do armazenamento
  const recuperados = S.carregarOrcamentos();
  assert.strictEqual(recuperados.length, 2);
  assert.deepStrictEqual(recuperados[0], a);

  const semA = recuperados.filter(function (o) { return o.id !== a.id; });
  S.salvarOrcamentos(semA);
  assert.strictEqual(S.carregarOrcamentos().length, 1);
  assert.strictEqual(S.carregarOrcamentos()[0].id, "ORC-2026-0002");
});

// 12
cenario("12. Dados corrompidos no localStorage não quebram a aplicação", function () {
  armazenamento[S.CHAVE_ORCAMENTOS] = "{isso não é json";
  assert.deepStrictEqual(S.carregarOrcamentos(), []);

  armazenamento[S.CHAVE_ORCAMENTOS] = JSON.stringify({ nao: "é lista" });
  assert.deepStrictEqual(S.carregarOrcamentos(), []);

  armazenamento[S.CHAVE_ORCAMENTOS] = JSON.stringify([orcamentoBase([item(1, 100)]), { id: 5 }, null, "x"]);
  assert.strictEqual(S.carregarOrcamentos().length, 1, "só o registro válido sobrevive");
});

// 13
cenario("13. Identificadores sequenciais, com prefixo por tipo e sem reaproveitar números", function () {
  const lista = [];
  const id1 = S.gerarIdentificador("orcamento", lista, 2026);
  lista.push({ id: id1 });
  const id2 = S.gerarIdentificador("os", lista, 2026);
  lista.push({ id: id2 });
  assert.strictEqual(id1, "ORC-2026-0001");
  assert.strictEqual(id2, "OS-2026-0002");

  // Excluir o último e gerar outro: o número 0002 NÃO volta
  lista.pop();
  const id3 = S.gerarIdentificador("orcamento", lista, 2026);
  assert.strictEqual(id3, "ORC-2026-0003");
});

// 14
cenario("14. Validação do orçamento completo (campos obrigatórios e itens)", function () {
  const ok = orcamentoBase([item(1, 1000)]);
  assert.deepStrictEqual(S.validarOrcamento(ok), []);

  const semItens = orcamentoBase([]);
  assert.ok(S.validarOrcamento(semItens).length > 0);

  const semCliente = orcamentoBase([item(1, 1000)]);
  semCliente.cliente.nome = "";
  assert.ok(S.validarOrcamento(semCliente).length > 0);

  const semEmpresa = orcamentoBase([item(1, 1000)]);
  semEmpresa.empresa.nome = "";
  assert.ok(S.validarOrcamento(semEmpresa).length > 0);

  const emailRuim = orcamentoBase([item(1, 1000)]);
  emailRuim.cliente.email = "isso-nao-e-email";
  assert.ok(S.validarOrcamento(emailRuim).length > 0);
});

// 15
cenario("15. Formatação de valores e percentuais", function () {
  assert.strictEqual(S.formatarMoeda(0), "R$ 0,00");
  assert.strictEqual(S.formatarMoeda(5), "R$ 0,05");
  assert.strictEqual(S.formatarMoeda(123456), "R$ 1.234,56");
  assert.strictEqual(S.formatarMoeda(100000000), "R$ 1.000.000,00");
  assert.strictEqual(S.formatarPercentual(1000), "10%");
  assert.strictEqual(S.formatarPercentual(1050), "10,5%");
  assert.strictEqual(S.formatarPercentual(1255), "12,55%");
  assert.strictEqual(S.centesimosParaTexto(1250), "12,50");
});

// 16
cenario("16. Valores máximos permitidos não estouram o limite seguro de inteiros", function () {
  const lista = [];
  for (let i = 0; i < 50; i++) lista.push(item(S.MAX_QUANTIDADE, S.MAX_PRECO_CENTAVOS));
  const t = S.calcularTotais(lista, S.interpretarDesconto("percentual", "99,99", 1).desconto);
  const subtotal = 50 * S.MAX_QUANTIDADE * S.MAX_PRECO_CENTAVOS;
  const bruto = subtotal * 9999;
  assert.ok(Number.isSafeInteger(bruto), "subtotal × percentual precisa caber em inteiro seguro");
  assert.strictEqual(t.subtotal, subtotal);
  assert.ok(t.total >= 0 && Number.isSafeInteger(t.total));
});

console.log("\nResultado: " + passou + " passaram, " + falhou + " falharam.\n");
process.exit(falhou === 0 ? 0 : 1);