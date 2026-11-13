#   Gerador de Orçamentos e Ordens de Serviço

Aplicação web feita só com **HTML, CSS e JavaScript puro** (sem frameworks, sem bibliotecas, sem backend). Pensada para pequenos prestadores de serviço montarem orçamentos e ordens de serviço, conferirem uma prévia profissional e imprimirem ou salvarem em PDF pelo próprio navegador.

#Como usar o projeto

1. Deixe os quatro itens abaixo na mesma pasta:
   
   index.html
   style.css
   script.js
   README.md
   
2. Abra o `index.html` com um duplo clique (ou arraste para o navegador). Não precisa de servidor.
3. Para publicar de graça, envie a pasta para o GitHub e ative o **GitHub Pages**.

#Passo a passo na tela

1. **Documento:** escolha *Orçamento* ou *Ordem de Serviço*, o status e a validade.
2. **Sua empresa:** preencha os dados. Clique em *Guardar como dados padrão* para que eles apareçam automaticamente nos próximos documentos.
3. **Cliente:** nome é obrigatório; o resto é opcional.
4. **Produtos e serviços:** informe descrição, quantidade e preço unitário e clique em *Adicionar item* (ou aperte Enter). Use *Editar* e *Remover* na tabela.
5. **Desconto:** escolha entre reais ou percentual. O total é recalculado na hora.
6. Confira a **prévia** ao lado (ou abaixo, no celular).
7. Clique em **Salvar orçamento**. O documento ganha um número como `ORC-2026-0001` (ou `OS-2026-0002` para ordens de serviço).
8. Clique em **Imprimir / salvar em PDF**. Na janela do navegador, escolha a impressora ou *Salvar como PDF* como destino.
9. Em **Documentos salvos** você pode buscar, filtrar por status, **Consultar** (somente leitura), **Editar** e **Excluir**.

> **Sobre o PDF:** o projeto não gera arquivos PDF sozinho. Ele usa a impressão do navegador, e o `style.css` (bloco `@media print`) esconde botões, formulário e lista para que só o documento saia na página.

#Regras de preenchimento

| Campo | Regra |
|---|---|
| Quantidade | Número **inteiro** de 1 a 1000. Não aceita negativo, zero, vírgula, letras ou vazio. |
| Preço unitário | De R$ 0,01 a R$ 100.000,00. Aceita `1234,56`, `1.234,56` e `1234.56`. |
| Desconto em reais | Não pode ser maior que o subtotal. |
| Desconto percentual | De 0 a 100 (aceita até 2 casas: `12,5`). |
| Itens | Máximo de 50 por documento. |
| Nome da empresa e do cliente | Obrigatórios para salvar. |
| E-mail | Opcional, mas se preenchido precisa ter formato válido. |

Se algo estiver inválido, a tela mostra uma mensagem explicando o que corrigir, e a aplicação continua funcionando.

#Como os cálculos funcionam (centavos inteiros)

Computadores guardam decimais de forma aproximada: em JavaScript, `0.1 + 0.2` dá `0.30000000000000004`. Para dinheiro isso é inaceitável. Por isso **todo valor é guardado e calculado em centavos inteiros**:

- R$ 49,90 vira `4990`
- `quantidade × preço` é multiplicação de inteiros
- O desconto percentual é guardado em "centésimos de por cento" (10% = `1000`, 12,5% = `1250`)
- Só na hora de **mostrar** o valor a função `formatarMoeda` converte de volta para `R$ 49,90`

Desconto percentual: `desconto = subtotal × percentual ÷ 10000`, arredondado ao centavo mais próximo (metade sobe), usando apenas inteiros.

Os limites da tabela acima existem para que nenhum número passe do maior inteiro seguro do JavaScript (`Number.MAX_SAFE_INTEGER`).

#Organização dos arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura: formulário, prévia do documento e lista de salvos. |
| `style.css` | Visual, layout responsivo e regras de impressão (`@media print`). |
| `script.js` | Toda a lógica. Está dividido em 11 seções comentadas. |
| `testes/testes-logica.js` | Testes automáticos dos cálculos, validações e localStorage (Node.js). |
| `testes/testes-navegador.py` | Testes opcionais da interface em navegador real (Playwright). |

#Explicação das principais funções (`script.js`)

#Dinheiro
- **`textoParaCentesimos(texto)`**: converte `"1.234,56"` em `123456`. Devolve `null` se o texto for inválido (letras, negativo, muitas vírgulas). Usa expressões regulares para validar o formato e **não** usa `parseFloat`, para evitar erros de precisão.
- **`formatarMoeda(centavos)`**: converte `123456` em `"R$ 1.234,56"`.
- **`formatarPercentual(centesimos)`**: converte `1050` em `"10,5%"`.

#Cálculos
- **`calcularSubtotalItem(item)`**: `quantidade × precoUnitarioCentavos`.
- **`calcularTotais(itens, desconto)`**: soma os subtotais, aplica o desconto (reais ou %) e devolve `{ subtotal, desconto, total }`. Tem uma "rede de segurança" que impede o desconto de passar do subtotal, então o total **nunca fica negativo**.

#Validação
- **`validarItem(descricao, qtd, preco)`**: confere os três campos de um item e devolve `{ erros, item }`.
- **`interpretarDesconto(tipo, texto, subtotal)`**: lê o campo de desconto. Se for inválido, devolve desconto zero e uma mensagem, para a tela continuar funcionando.
- **`validarOrcamento(orc)`**: validação final antes de salvar (empresa, cliente, itens, e-mails, total).
- **`orcamentoValido(o)`**: confere se um registro lido do localStorage tem o formato esperado, descartando dados corrompidos.

#localStorage
- **`lerJSON` / `gravarJSON`**: leem e gravam com `JSON.parse`/`JSON.stringify` dentro de `try/catch` (o armazenamento pode estar bloqueado, cheio ou corrompido).
- **`carregarOrcamentos` / `salvarOrcamentos`**: leem e gravam a lista de documentos.
- **`gerarIdentificador(tipo, lista, ano)`**: cria `ORC-2026-0001`. Usa um contador próprio, então o número de um documento excluído **não é reaproveitado**.

#Tela
- **`lerFormulario()`**: junta tudo o que está digitado em um objeto.
- **`atualizarTela()`**: recalcula totais e redesenha a prévia a cada alteração.
- **`renderizarItens()`, `renderizarPrevia()`, `renderizarLista()`**: desenham tabela de itens, documento e lista de salvos usando `textContent` (nunca `innerHTML` com texto do usuário), o que impede que alguém digite HTML e quebre a página.
- **`aoSalvar()`, `abrirSalvo()`, `excluirSalvo()`, `novoDocumento()`, `aoImprimir()`**: ações dos botões.

#Formato de um documento salvo


{
  id: "ORC-2026-0001",
  tipoDocumento: "orcamento",        // ou "os"
  status: "pendente",                // "aprovado" | "recusado"
  criadoEm: "2026-11-12T15:00:00.000Z",
  atualizadoEm: "2026-11-12T15:00:00.000Z",
  validadeDias: 15,
  empresa: { nome, documento, telefone, email, endereco },
  cliente: { nome, documento, telefone, email, endereco },
  itens: [ { id: 1, descricao: "Pintura", quantidade: 3, precoUnitarioCentavos: 10000 } ],
  desconto: { tipo: "percentual", valor: 1000 },   // 10%
  observacoes: ""
}


Os totais **não** são gravados: são sempre recalculados a partir dos itens, para nunca ficarem inconsistentes.

#Exemplos de teste manual

| # | Faça | Resultado esperado |
|---|---|---|
| 1 | Itens: 2 × 150,00 / 1 × 49,90 / 10 × 2,50 | Subtotal **R$ 374,90** |
| 2 | Desconto de R$ 24,90 | Total **R$ 350,00** |
| 3 | Desconto de 10% | Desconto R$ 37,49, total **R$ 337,41** |
| 4 | Desconto de 150% ou de R$ 999,00 | Mensagem de erro; total continua R$ 374,90 |
| 5 | Quantidade `-1`, `0`, `1,5` ou vazia | Item recusado com mensagem |
| 6 | Preço `-5`, `0`, `abc` ou vazio | Item recusado com mensagem |
| 7 | Clique em *Editar* num item, mude a quantidade e salve o item | A linha é atualizada (sem duplicar) e o total muda |
| 8 | Clique em *Remover* | Linha some e o total é recalculado |
| 9 | Salve, aperte F5 | O documento continua na lista |
| 10 | *Consultar* um documento | Campos bloqueados; *Editar este documento* libera |
| 11 | Excluir um documento e aperte F5 | Continua excluído |
| 12 | Imprimir (Ctrl+P) | Só o documento aparece: sem botões, formulário ou lista |

#Testes realizados nesta entrega

Os testes abaixo foram **executados** em um ambiente com Node.js 22 e Chromium 153 (via Playwright). Isso **não** substitui testar no seu próprio computador e navegador.

#Executados automaticamente

- **`node testes/testes-logica.js`**: 16 cenários, todos passaram. Cobrem precisão monetária, conversão de texto, vários itens, desconto em reais e %, arredondamento, descontos inválidos, desconto de 100% (total nunca negativo), validação de itens, exclusão de itens, gravar e ler do localStorage, dados corrompidos, identificadores sem reaproveitamento, validação do documento completo, formatação e limites máximos.
- **`python3 testes/testes-navegador.py`** (opcional): 40 verificações em Chromium real, todas passaram. Cobrem adicionar, editar e remover itens com a interface, descontos válidos e inválidos, salvar, **recarregar a página** e conferir que os dados continuam lá, consultar, editar, excluir, filtros, número sequencial para orçamento e OS, proteção contra HTML digitado, localStorage corrompido, dados padrão da empresa, ausência de erros de JavaScript e página sem rolagem horizontal a 375 px de largura.
- **Impressão:** em modo de impressão (`emulate_media("print")`), cabeçalho, formulário, botões e lista de salvos ficam ocultos. Um PDF de 1 página foi gerado pelo Chromium e o texto extraído dele **não contém** nenhum texto de botão ou de interface.

#Verificados apenas por inspeção

- Aparência visual da interface no desktop (conferida em captura de tela). O layout de celular foi testado apenas quanto à rolagem horizontal, sem revisão visual detalhada.
- Comportamento em **Firefox, Safari e Edge** e em impressoras reais: **não testado**. O nome sugerido para o arquivo PDF (vem do título da página) pode variar entre navegadores.
- Acessibilidade (foco visível, mensagens com `role`, rótulos nos campos) foi revisada no código, sem teste com leitor de tela.

#Um bug encontrado e corrigido durante os testes

Ao digitar num campo (por exemplo, o desconto) e clicar **direto** em *Editar* ou *Remover*, o clique podia se perder: a tabela era redesenhada quando o campo perdia o foco, apagando o botão antes do clique terminar. A correção foi redesenhar a tabela de itens somente quando os itens mudam (parâmetro `recriarTabela` em `atualizarTela`). Há um teste de regressão para isso (B5b).

#Limitações conhecidas

- **Os dados ficam só neste navegador e neste computador.** Limpar os dados do navegador apaga os orçamentos. Para levar para outro lugar seria preciso uma função de exportar e importar (ideia de evolução).
- A quantidade aceita **apenas números inteiros** (para horas fracionadas, como 1,5 h, use outro item ou ajuste o preço). Aceitar decimais exigiria guardar a quantidade também como inteiro escalado.
- Ponto isolado como `1.234` é lido como "mil duzentos e trinta e quatro" (formato brasileiro de milhar), e `1.5` como "um e cinquenta". Se preferir, digite sempre com vírgula.
- O número do documento é uma sequência única (não reinicia a cada ano).

#Ideias para evoluir

- Exportar e importar os documentos em arquivo `.json`
- Logotipo da empresa (leitura de imagem em `data:` URL)
- Quantidades decimais
- Campo de forma de pagamento com opções prontas