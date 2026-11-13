"""Testes de interface em navegador real (OPCIONAL, ferramenta de desenvolvimento).
Requisitos: pip install playwright && playwright install chromium   (e pdftotext, para ler o PDF)
Como rodar, a partir da pasta do projeto:  python3 testes/testes-navegador.py
O projeto em si NÃO depende de nada disso."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess, re, tempfile

RAIZ = Path(__file__).resolve().parent.parent
URL = (RAIZ / "index.html").as_uri()
TMP = Path(tempfile.mkdtemp())
res = []
def check(nome, cond, detalhe=""):
    res.append((nome, bool(cond)))
    print(("  OK   " if cond else "  FALHOU  ") + nome + (("  -> " + str(detalhe)) if (detalhe and not cond) else ""))

def add_item(page, desc, qtd, preco):
    page.fill("#item-descricao", desc); page.fill("#item-quantidade", qtd); page.fill("#item-preco", preco)
    page.click("#btn-item")

def preencher_base(page):
    page.fill("#empresa-nome", "Oficina Silva"); page.fill("#cliente-nome", "Maria Souza")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    erros_js = []
    page.on("pageerror", lambda e: erros_js.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(URL)

    # B1 itens e totais
    preencher_base(page)
    add_item(page, "Troca de óleo", "2", "150,00")
    add_item(page, "Filtro", "1", "49,90")
    add_item(page, "Lavagem", "10", "2,50")
    check("B1 três itens: subtotal R$ 374,90", page.inner_text("#resumo-subtotal") == "R$ 374,90", page.inner_text("#resumo-subtotal"))
    check("B1 linhas na tabela = 3", page.locator("#tabela-itens-corpo tr").count() == 3)

    # B2 desconto em reais e %
    page.fill("#desconto-valor", "24,90")
    check("B2 desconto R$ 24,90 -> total R$ 350,00", page.inner_text("#resumo-total") == "R$ 350,00", page.inner_text("#resumo-total"))
    page.select_option("#desconto-tipo", "percentual"); page.fill("#desconto-valor", "10")
    check("B2 desconto 10% -> total R$ 337,41", page.inner_text("#resumo-total") == "R$ 337,41", page.inner_text("#resumo-total"))
    check("B2 prévia mostra 'Desconto (10%)'", "Desconto (10%)" in page.inner_text("#doc-linha-desconto"))

    # B3 descontos inválidos
    page.fill("#desconto-valor", "150")
    check("B3 150% mostra erro e total sem desconto", page.is_visible("#erro-desconto") and page.inner_text("#resumo-total") == "R$ 374,90")
    page.select_option("#desconto-tipo", "valor"); page.fill("#desconto-valor", "999,00")
    check("B3 desconto maior que subtotal mostra erro", page.is_visible("#erro-desconto") and page.inner_text("#resumo-total") == "R$ 374,90")
    page.fill("#desconto-valor", "-5")
    check("B3 desconto negativo mostra erro", page.is_visible("#erro-desconto"))
    page.fill("#desconto-valor", "10")  # mantém 10,00 para os próximos testes
    check("B3 total com desconto R$ 10,00 = R$ 364,90", page.inner_text("#resumo-total") == "R$ 364,90")

    # B4 itens inválidos
    for d,q,pr in [("X","-1","10"),("X","0","10"),("X","","10"),("X","1",""),("","1","10"),("X","1","-3"),("X","1","abc")]:
        n = page.locator("#tabela-itens-corpo tr").count()
        add_item(page, d, q, pr)
        ok = page.is_visible("#erro-item") and page.locator("#tabela-itens-corpo tr").count() == n
        check(f"B4 item inválido recusado ({d!r},{q!r},{pr!r})", ok)
    page.click("#btn-cancelar-item") if page.is_visible("#btn-cancelar-item") else None
    page.fill("#item-descricao", ""); page.fill("#item-quantidade", "1"); page.fill("#item-preco", "")

    # B5 editar item
    page.locator("#tabela-itens-corpo tr").nth(1).locator("button[data-acao=editar-item]").click()
    check("B5 editar carrega item no formulário", page.input_value("#item-descricao") == "Filtro" and page.input_value("#item-preco") == "49,90")
    page.fill("#item-quantidade", "2"); page.click("#btn-item")
    check("B5 editar atualiza subtotal (2 × 49,90 = 99,80) sem duplicar linha",
          "R$ 99,80" in page.inner_text("#tabela-itens-corpo") and page.locator("#tabela-itens-corpo tr").count() == 3)
    check("B5 subtotal geral 424,80 e total 414,80", page.inner_text("#resumo-subtotal") == "R$ 424,80" and page.inner_text("#resumo-total") == "R$ 414,80",
          (page.inner_text("#resumo-subtotal"), page.inner_text("#resumo-total")))

    # B5b regressão: digitar num campo e clicar direto em Editar/Remover (sem sair do campo antes)
    page.fill("#desconto-valor", "10")
    page.locator("#tabela-itens-corpo tr").nth(0).locator("button[data-acao=editar-item]").click()
    check("B5b clique em Editar logo após digitar em outro campo funciona", page.input_value("#item-descricao") == "Troca de óleo", page.input_value("#item-descricao"))
    page.click("#btn-cancelar-item")

    # B6 remover item
    page.locator("#tabela-itens-corpo tr").nth(2).locator("button[data-acao=remover-item]").click()
    check("B6 remover item: 2 linhas, subtotal 399,80, total 389,80", page.locator("#tabela-itens-corpo tr").count() == 2 and page.inner_text("#resumo-total") == "R$ 389,80", page.inner_text("#resumo-total"))

    # B7 salvar sem campos obrigatórios
    page.click("#btn-novo")
    page.click("#btn-salvar")
    check("B7 salvar vazio mostra erros e não grava", page.is_visible("#erro-salvar") and page.evaluate("localStorage.getItem('gerador_orcamentos_v1')") is None)

    # B8 salvar + recarregar
    preencher_base(page)
    page.select_option("#status", "aprovado")
    add_item(page, "Pintura", "3", "100,00")
    page.fill("#desconto-valor", "10"); page.select_option("#desconto-tipo", "percentual")
    page.click("#btn-salvar")
    check("B8 salvou e gerou ORC-AAAA-0001", re.search(r"ORC-\d{4}-0001", page.inner_text("#msg-global") or "") is not None, page.inner_text("#msg-global"))
    page.reload()
    check("B8 após recarregar, lista contém o documento", page.locator("#lista-salvos li").count() == 1 and "Maria Souza" in page.inner_text("#lista-salvos") and "R$ 270,00" in page.inner_text("#lista-salvos"), page.inner_text("#lista-salvos"))
    check("B8 status aprovado preservado", "Aprovado" in page.inner_text("#lista-salvos"))

    # B9 consultar (somente leitura)
    page.click("button[data-acao=consultar]")
    check("B9 consulta bloqueia campos", page.evaluate("document.getElementById('campos').disabled") and page.is_disabled("#btn-salvar"))
    check("B9 consulta carrega dados", page.input_value("#cliente-nome") == "Maria Souza" and page.inner_text("#doc-total") == "R$ 270,00")

    # B10 editar e salvar (mantém id)
    page.click("#btn-liberar-edicao")
    page.select_option("#status", "recusado"); add_item(page, "Lixamento", "1", "30,00")
    page.click("#btn-salvar")
    page.reload()
    check("B10 edição mantém 1 documento, mesmo número, status recusado e novo total R$ 297,00 (330,00 - 10%)",
          page.locator("#lista-salvos li").count() == 1 and "Recusado" in page.inner_text("#lista-salvos") and "0001" in page.inner_text("#lista-salvos") and "R$ 297,00" in page.inner_text("#lista-salvos"),
          page.inner_text("#lista-salvos"))

    # B11 segundo documento (OS) + filtros
    page.click("#btn-novo"); preencher_base(page); page.fill("#cliente-nome", "João Lima")
    page.select_option("#tipo-documento", "os"); add_item(page, "Reparo", "1", "80,00"); page.click("#btn-salvar")
    check("B11 OS recebe OS-AAAA-0002", re.search(r"OS-\d{4}-0002", page.inner_text("#lista-salvos")) is not None)
    page.select_option("#filtro-status", "recusado")
    check("B11 filtro por status recusado mostra 1", page.locator("#lista-salvos li").count() == 1)
    page.select_option("#filtro-status", "todos"); page.fill("#filtro-busca", "joão")
    check("B11 busca por cliente mostra 1", page.locator("#lista-salvos li").count() == 1)
    page.fill("#filtro-busca", "")

    # B12 excluir
    page.locator("#lista-salvos li").filter(has_text="João Lima").locator("button[data-acao=excluir]").click()
    page.reload()
    check("B12 excluir remove e persiste após recarregar", page.locator("#lista-salvos li").count() == 1 and "João" not in page.inner_text("#lista-salvos"))

    # B13 XSS / texto especial
    page.click("#btn-novo"); preencher_base(page); page.fill("#cliente-nome", "<img src=x onerror=window.__xss=1>")
    add_item(page, "<b>negrito</b>", "1", "5")
    check("B13 HTML digitado aparece como texto, não é interpretado",
          page.evaluate("window.__xss") is None and page.locator("#doc-itens b").count() == 0 and "<b>negrito</b>" in page.inner_text("#doc-itens"))

    # B14 localStorage corrompido
    page.evaluate("localStorage.setItem('gerador_orcamentos_v1','{quebrado')")
    page.reload()
    check("B14 localStorage corrompido: página abre e lista vazia", page.locator("#lista-salvos li").count() == 0 and "Nenhum documento" in page.inner_text("#contagem-salvos"))

    # B15 dados da empresa padrão
    page.fill("#empresa-nome", "Oficina Silva"); page.fill("#empresa-telefone", "(85) 99999-0000")
    page.click("#btn-salvar-empresa"); page.reload()
    check("B15 dados padrão da empresa voltam após recarregar", page.input_value("#empresa-nome") == "Oficina Silva" and page.input_value("#empresa-telefone") == "(85) 99999-0000")

    # B16 impressão: mídia print
    preencher_base(page); add_item(page, "Pintura", "2", "100,00")
    page.emulate_media(media="print")
    esconder = ["header.topo", ".coluna-formulario", ".salvos", ".coluna-previa > h2", "#btn-salvar", "#btn-imprimir", "#btn-item"]
    vis = {s: page.is_visible(s) for s in esconder}
    check("B16 em modo print: cabeçalho, formulário, botões e lista ficam ocultos", not any(vis.values()), vis)
    check("B16 em modo print: documento visível", page.is_visible("#documento"))
    page.pdf(path=str(TMP / "saida.pdf"), format="A4", prefer_css_page_size=True, print_background=True)
    page.emulate_media(media="screen")

    check("Nenhum erro JavaScript durante todos os testes", not erros_js, erros_js)

    # B17 responsivo (mobile): sem rolagem horizontal
    m = b.new_context(viewport={"width": 375, "height": 800}).new_page()
    m.goto(URL); m.fill("#empresa-nome", "Oficina Silva"); m.fill("#cliente-nome", "Maria")
    m.fill("#item-descricao", "Serviço com descrição bem longa para testar quebra de linha no celular"); m.fill("#item-preco", "1234,56"); m.click("#btn-item")
    larg = m.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    check("B17 mobile 375px sem rolagem horizontal da página", larg[0] <= larg[1], larg)
    m.screenshot(path=str(TMP / "mobile.png"), full_page=True)

    page.set_viewport_size({"width": 1280, "height": 900})
    page.click("#btn-novo"); preencher_base(page); add_item(page, "Pintura", "2", "100,00"); page.fill("#desconto-valor", "10")
    page.screenshot(path=str(TMP / "desktop.png"), full_page=False)
    b.close()

txt = subprocess.run(["pdftotext", "-layout", str(TMP / "saida.pdf"), "-"], capture_output=True, text=True).stdout
print("\n--- Texto extraído do PDF gerado em modo de impressão ---\n" + txt)
proibidos = ["Adicionar item", "Salvar orçamento", "Imprimir", "Guardar como", "Novo documento", "Documentos salvos", "Remover", "Prévia do documento"]
ach = [t for t in proibidos if t in txt]
check("B16 PDF não contém textos de botões/interface", not ach, ach)
pags = subprocess.run(["pdfinfo", str(TMP / "saida.pdf")], capture_output=True, text=True).stdout
print([l for l in pags.splitlines() if l.startswith("Pages")])
falhas = [n for n, ok in res if not ok]
print(f"\nResultado: {len(res)-len(falhas)} OK, {len(falhas)} falhas")