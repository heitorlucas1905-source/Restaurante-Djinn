/* ===== API (C#) ===== */
// Endereco da API em C#
const API = "http://localhost:5000/api";
const FRETE = 8;

//: manda/recebe JSON.
async function chamarApi(caminho, metodo = "GET", corpo = null) {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : null
  });
  const texto = await resposta.text();
  let dados = texto;
  try { dados = JSON.parse(texto); } catch (e) {}
  if (!resposta.ok) throw new Error(typeof dados === "string" && dados ? dados : "Erro " + resposta.status);
  return dados;
}

let PRODUTOS = [];   // vem do banco de dados, via API
async function carregarProdutos() {
  try {
    const lista = await chamarApi("/produtos");
    PRODUTOS = lista.map(p => ({
      id: p.id, cat: p.categoria, nome: p.nome, preco: p.preco, desc: p.descricao,
      porcao: p.porcao + (p.vegetariano ? " • Vegetariano" : "")
    }));
  } catch (e) {
    $("#lista-prod").innerHTML = "<p>Não foi possível carregar o cardápio. A API em C# está rodando?</p>";
    return;
  }
  desenharProdutos();
}

let carrinho = {};   // comeca vazio
let desconto = 0;
let logado = false;
let cliente = null;   // { id, nome } do cliente logado
let pedidos = [];   // pedidos da conta logada: vem do banco (GET /api/pedidos/cliente/ID)

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const reais = v => "R$ " + v.toFixed(2).replace(".", ",");

const LAMPADA = '<svg viewBox="0 0 32 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#e3b92f" d="M16 1c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z"/><path fill="#a88732" d="M11 14c0-2 2-4 5-4s5 2 5 4z"/><path fill="#c9a227" d="M7 14h18c0 6-3 10-9 10s-9-4-9-10z"/><path fill="#a88732" d="M24 15c3 0 5-2 7-6-.3 5-2 9-7 10zM8 15C4 15 2 13 1 10c3 1 5 1 7 1zM11 24h10l1 3H10z"/></svg>';

/*  POP-UP "SEU PEDIDO FOI REALIZADO" */
function abrirPopup(num) {
  $("#popup-num").textContent = "Pedido #" + num + " • já estamos preparando tudo para você.";
  $("#popup-pedido").hidden = false;
}
function fecharPopup() { $("#popup-pedido").hidden = true; }

/*  NAVEGACAO  */
function ir(pagina) {
  $$(".pagina").forEach(p => (p.hidden = p.id !== pagina));
  $$("nav a").forEach(a => a.classList.toggle("ativo", a.dataset.page === pagina));
  if (pagina === "carrinho") desenharCarrinho();
  if (pagina === "pedidos") carregarPedidos();
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => {
  const alvo = e.target.closest("[data-page]");
  if (alvo) ir(alvo.dataset.page);
  const add = e.target.closest("[data-add]");
  if (add) adicionar(+add.dataset.add, 1);
  /* botões do carrinho: − + Remover */
  const mais = e.target.closest("[data-mais]");
  if (mais) adicionar(+mais.dataset.mais, 1);
  const menos = e.target.closest("[data-menos]");
  if (menos) adicionar(+menos.dataset.menos, -1);
  const rem = e.target.closest("[data-remover]");
  if (rem) { delete carrinho[rem.dataset.remover]; atualizarContador(); desenharCarrinho(); }
});
$("#popup-lampada").innerHTML = LAMPADA;
$("#popup-pedido").addEventListener("click", e => {
  if (e.target.id === "popup-pedido" || e.target.closest("[data-fechar]")) fecharPopup();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharPopup(); });
$("#icone-usuario").onclick = () => ir(logado ? "perfil" : "login");
$("#sair").onclick = () => {
  logado = false; cliente = null;
  pedidos = []; carrinho = {}; desconto = 0; status = ""; textoPed = "";   // tudo é da conta; sai junto
  atualizarContador();
  $("#area-pedidos").innerHTML = "";
  ir("login");
};

/*  LOGIN E CADASTRO  */

/* MASCARAS E VALIDACOES DOS CAMPOS DE CADASTRO */
function somenteNumeros(valor, limite) {
  return valor.replace(/\D/g, "").slice(0, limite);
}
function aplicarMascara(id, limite, formatar) {
  const campo = $(id);
  if (!campo) return;
  campo.addEventListener("input", () => {
    campo.value = formatar(somenteNumeros(campo.value, limite));
  });
}
aplicarMascara("#cad-cpf", 11, v => v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"));
aplicarMascara("#cad-telefone", 11, v => v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2"));
aplicarMascara("#cad-cep", 8, v => v.replace(/(\d{5})(\d)/, "$1-$2"));
aplicarMascara("#cad-nasc", 8, v => v.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2"));
["#cad-numero"].forEach(id => {
  const campo = $(id);
  if (campo) campo.addEventListener("input", () => campo.value = somenteNumeros(campo.value, 6));
});

$("#form-login").onsubmit = async e => {
  e.preventDefault();
  try {
    const dados = await chamarApi("/clientes/login", "POST",
      { email: $("#login-email").value, senha: $("#login-senha").value });
    logado = true;
    cliente = dados;                                   // { id, nome }
    $("#nome-perfil").textContent = dados.nome;
    $("#login-msg").textContent = "";
    ir("home");
  } catch (erro) {
    $("#login-msg").textContent = "Usuário ou senha incorretos.";
  }
};
$("#form-cadastro").onsubmit = async e => {
  e.preventDefault();
  if ($("#cad-senha").value !== $("#cad-senha2").value) { alert("As senhas não são iguais."); return; }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test($("#cad-senha").value)) { alert("A senha deve ter pelo menos 8 caracteres, incluindo letras e números."); return; }
  if (somenteNumeros($("#cad-cpf").value, 11).length !== 11) { alert("Digite um CPF com 11 números."); return; }
  if (somenteNumeros($("#cad-telefone").value, 11).length < 10) { alert("Digite um telefone válido."); return; }
  // "15/04/1995" -> "1995-04-15" (formato do MySQL)
  const n = $("#cad-nasc").value.trim().split("/");
  const nasc = n.length === 3 ? `${n[2]}-${n[1]}-${n[0]}` : null;
  const dadosCadastro = {
    nomeCompleto: $("#cad-nome").value, email: $("#cad-email").value, telefone: $("#cad-telefone").value,
    cpf: $("#cad-cpf").value, dataNascimento: nasc, cep: $("#cad-cep").value, bairro: $("#cad-bairro").value,
    rua: $("#cad-rua").value, numero: $("#cad-numero").value, complemento: $("#cad-comp").value || null,
    pontoReferencia: $("#cad-ref").value || null, cidade: $("#cad-cidade").value, estado: "MG",
    senha: $("#cad-senha").value, aceitouTermos: $("#cad-termos").checked, aceitaNovidades: $("#cad-novidades").checked
  };
  try {
    await chamarApi("/clientes", "POST", dadosCadastro);
    alert("Conta criada com sucesso! Faça login para continuar.");
    ir("login");
  } catch (erro) {
    alert(erro.message);
  }
};

/* olho para mostrar/esconder senha */
const OLHO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#154418" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
$$("input[type=password]").forEach(campo => {
  const caixa = document.createElement("div");
  caixa.className = "campo-senha";
  campo.replaceWith(caixa);
  const botao = document.createElement("button");
  botao.type = "button";
  botao.innerHTML = OLHO;
  botao.onclick = () => (campo.type = campo.type === "password" ? "text" : "password");
  caixa.append(campo, botao);
});

/*  PRODUTOS  */
let categoria = "";
function desenharProdutos() {
  const texto = $("#busca-prod").value.toLowerCase();
  const lista = PRODUTOS.filter(p =>
    (!categoria || p.cat === categoria) && (p.nome + p.desc).toLowerCase().includes(texto));
  $("#total-prod").textContent = lista.length;
  $("#lista-prod").innerHTML = lista.map(p => `
    <div class="prod"><div class="prod-foto foto-${p.id}" role="img" aria-label="Sugestão visual de prato árabe"></div><small>${p.cat}</small><h3>${p.nome}</h3><p>${p.desc}</p>
      <small>${p.porcao}</small>
      <div class="linha-entre"><span>${reais(p.preco)}</span><button class="btn" data-add="${p.id}">+ Adicionar</button></div>
    </div>`).join("");
}
$("#busca-prod").oninput = desenharProdutos;
$("#btn-busca-prod").onclick = desenharProdutos;
$("#chips-prod").onclick = e => {
  if (!e.target.dataset.hasOwnProperty("cat")) return;
  categoria = e.target.dataset.cat;
  $$("#chips-prod .chip").forEach(c => c.classList.toggle("ativo", c === e.target));
  desenharProdutos();
};

/*  CARRINHO  */
function adicionar(id, n) {
  carrinho[id] = (carrinho[id] || 0) + n;
  if (carrinho[id] <= 0) delete carrinho[id];
  atualizarContador();
  if (!$("#carrinho").hidden) desenharCarrinho();
}
function atualizarContador() {
  $("#qtd").textContent = Object.values(carrinho).reduce((a, b) => a + b, 0);
}
function desenharCarrinho() {
  const ids = Object.keys(carrinho);
  const total = Object.values(carrinho).reduce((a, b) => a + b, 0);
  $("#titulo-carrinho").textContent = `Seu pedido • ${total} ${total === 1 ? "porção" : "porções"}`;
  $("#itens-carrinho").innerHTML = ids.map(id => {
    const p = PRODUTOS.find(x => x.id == id), q = carrinho[id];
    return `<div class="item"><h4>${p.nome}</h4>
      <span>${p.porcao}${p.extra ? " • " + p.extra : ""}</span>
      <span class="valor">${reais(p.preco * q)}</span>
      <span>${reais(p.preco)} / porção
        <span class="qtd"><button data-menos="${id}">−</button><span>${q}</span><button data-mais="${id}">+</button></span></span>
      <button class="remover" data-remover="${id}">Remover</button></div>`;
  }).join("") || "<p>Seu carrinho está vazio.</p>";

  const sub = ids.reduce((s, id) => s + PRODUTOS.find(x => x.id == id).preco * carrinho[id], 0);
  const entrega = sub ? FRETE : 0;
  const desc = sub * desconto;
  $("#r-sub").textContent = reais(sub);
  $("#r-ent").textContent = reais(entrega);
  $("#r-desc").textContent = reais(desc);
  $("#r-total").textContent = reais(sub + entrega - desc);
}
$("#btn-cupom").onclick = () => {
  const ok = $("#cupom").value.trim().toUpperCase() === "DJINN10";
  desconto = ok ? 0.1 : 0;
  $("#cupom-msg").textContent = ok ? "Cupom aplicado: 10% de desconto." : "Cupom inválido.";
  desenharCarrinho();
};
$("#finalizar").onclick = async () => {
  if (!Object.keys(carrinho).length) return;
  if (!logado) { ir("login"); return; }

  // JSON envia para o C#
  const pedidoJson = {
    clienteId: cliente.id,
    cupom: desconto > 0 ? $("#cupom").value.trim() : "",
    itens: Object.keys(carrinho).map(id => ({ produtoId: +id, quantidade: carrinho[id] }))
  };

  try {
    const resposta = await chamarApi("/pedidos", "POST", pedidoJson);   // POST /api/pedidos
    carrinho = {}; desconto = 0;
    atualizarContador(); desenharCarrinho();
    $("#cupom").value = ""; $("#cupom-msg").textContent = ""; $("#final-msg").textContent = "";
    abrirPopup(resposta.numero);
  } catch (erro) {
    $("#final-msg").textContent = "Não foi possível enviar o pedido: " + erro.message;
  }
};

/* PEDIDOS: pagina vazia ate o cliente confirmar um pedido */
let status = "", textoPed = "";
const hora = (t, o) => new Date(t).toLocaleString("pt-BR", o);
const DATA = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
const HM = { hour: "2-digit", minute: "2-digit" };

async function carregarPedidos() {
  if (logado) {
    try {
      const lista = await chamarApi("/pedidos/cliente/" + cliente.id);   // GET
      pedidos = lista.map(p => {
        const itens = p.itens.map(i => ({ id: i.produtoId, nome: i.nome, qtd: i.quantidade, preco: i.preco }));
        const sub = itens.reduce((t, i) => t + i.preco * i.qtd, 0);
        return { num: p.numero, data: new Date(p.data).getTime(), itens, sub, entrega: FRETE,
                 desc: Math.max(0, sub + FRETE - p.total), total: p.total, status: p.status.toLowerCase() };
      });
    } catch (e) { pedidos = []; }
  }
  desenharPedidos();
}

function cartaoAndamento(p) {
  return `<div class="pedido">
    <div class="linha-entre"><span>Pedido #${p.num} • ${hora(p.data, DATA)}</span><span class="selo">Em preparo</span></div>
    <div class="etapas"><div class="feita">Pedido recebido</div><div class="feita">Em preparo</div><div>Saiu para entrega</div><div>Entregue</div></div>
    <div class="linha-entre"><span class="pequeno">Previsão de entrega ${hora(p.data + 40 * 6e4, HM)}–${hora(p.data + 55 * 6e4, HM)}</span></div>
    <div class="linha-entre alto">
      <div class="pequeno">${p.itens.map(i => `${i.qtd} × ${i.nome} — ${reais(i.preco * i.qtd)}`).join("<br>")}<br><br>Entrega: Rua dos Timbiras, 1200, ap. 302 — Lourdes, Belo Horizonte — MG.</div>
      <div class="resumo-mini"><span>Subtotal</span><span>${reais(p.sub)}</span><span>Entrega</span><span>${reais(p.entrega)}</span>${p.desc ? `<span>Desconto</span><span>−${reais(p.desc)}</span>` : ""}<b>Total</b><b>${reais(p.total)}</b></div>
    </div></div>`;
}
function cartaoAnterior(p) {
  return `<div class="pedido">
    <div class="linha-entre"><span>Pedido #${p.num} • ${hora(p.data, DATA)}</span><span class="pequeno">${p.status === "entregue" ? "Entregue" : "Cancelado"}</span></div>
    <p class="pequeno">${p.itens.map(i => `${i.qtd} × ${i.nome} (${reais(i.preco)})`).join(" • ")}</p>
    <div class="linha-entre"><span class="pequeno">Subtotal ${reais(p.sub)} + entrega ${reais(p.entrega)} • Total ${reais(p.total)}</span>
      <button class="btn peq" data-repetir="${p.num}">Pedir novamente</button></div></div>`;
}
function desenharPedidos() {
  const area = $("#area-pedidos");
  if (!pedidos.length) {   // nenhum pedido: mensagem menos agressiva...
    area.innerHTML = `<div class="vazio"><span class="vazio-lampada">${LAMPADA}</span>
      <h3>Nenhum pedido feito</h3>
      <p>${logado ? "Quando você fizer um pedido, ele aparece aqui para você acompanhar." : "Crie sua conta ou entre para fazer seu primeiro pedido e acompanhá-lo por aqui."}</p>
      ${logado ? '<button class="btn" data-page="produtos">Ver cardápio</button>'
               : '<button class="btn" data-page="cadastro">Criar conta</button> <button class="btn-claro" data-page="login">Entrar</button>'}</div>`;
    return;
  }
  if (!$("#busca-ped")) {
    area.innerHTML = `<label class="pequeno">Buscar</label>
      <div class="busca"><input id="busca-ped" placeholder="Busque pelo número do pedido ou nome do prato"><button class="btn" id="btn-busca-ped">Buscar</button></div>
      <div class="chips" id="chips-ped"><button class="chip ativo" data-st="">Todos os pedidos</button><button class="chip" data-st="andamento">Em andamento</button><button class="chip" data-st="entregue">Entregues</button><button class="chip" data-st="cancelado">Cancelados</button></div>
      <div id="ped-and"></div><div id="ped-ant"></div><p class="centro pequeno" id="ped-total"></p>`;
  }
  const vis = pedidos.filter(p => (!status || p.status === status) &&
    (`#${p.num} ` + p.itens.map(i => i.nome).join(" ")).toLowerCase().includes(textoPed)).reverse();
  const and = vis.filter(p => p.status === "andamento"), ant = vis.filter(p => p.status !== "andamento");
  $("#ped-and").innerHTML = and.length ? '<h3 class="subtitulo">Seu pedido em andamento</h3>' + and.map(cartaoAndamento).join("") : "";
  $("#ped-ant").innerHTML = ant.length ? '<h3 class="subtitulo">Pedidos anteriores</h3>' + ant.map(cartaoAnterior).join("") : "";
  $("#ped-total").textContent = `Exibindo ${vis.length} de ${pedidos.length} pedidos`;
}
$("#area-pedidos").addEventListener("input", e => { if (e.target.id === "busca-ped") { textoPed = e.target.value.toLowerCase(); desenharPedidos(); } });
$("#area-pedidos").addEventListener("click", e => {
  if (e.target.id === "btn-busca-ped") desenharPedidos();
  if (e.target.dataset.st !== undefined) {
    status = e.target.dataset.st;
    $$("#chips-ped .chip").forEach(c => c.classList.toggle("ativo", c === e.target));
    desenharPedidos();
  }
  if (e.target.dataset.repetir) {
    const p = pedidos.find(x => x.num == e.target.dataset.repetir);
    p.itens.forEach(i => adicionar(i.id, i.qtd));
    ir("carrinho");
  }
});

/*  MODO CLARO / ESCURO  */
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  $("#tema").title = t === "dark" ? "Modo claro" : "Modo escuro";
  $("#tema").setAttribute("aria-pressed", t === "dark");
  try { localStorage.setItem("tema", t); } catch (e) {}
}
$("#tema").onclick = () => aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
aplicarTema(document.documentElement.dataset.theme || "light");

/*  INICIO  */
carregarProdutos();
atualizarContador();
ir("home");
