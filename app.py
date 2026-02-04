import io
import pandas as pd
import streamlit as st
import requests
from streamlit_autorefresh import st_autorefresh

st.set_page_config(page_title="Painel NIR - Censo Diário", layout="wide")

CSV_URL = "https://docs.google.com/spreadsheets/d/1wA--gbvOmHWcUvMBTldVC8HriI3IXfQoEvQEskCKGDk/gviz/tq?tqx=out:csv&sheet=Folha1"

st_autorefresh(interval=60_000, key="nir_autorefresh")  # 60s

TITULOS = [
    "ALTAS",
    "VAGAS RESERVADAS",
    "CIRURGIAS PROGRAMADAS",
    "TRANSFERÊNCIAS SAIDAS",
    "TRANSFERENCIAS SAIDAS",  # fallback sem acento
]

@st.cache_data(ttl=30)
def baixar_linhas_csv(url: str) -> list[list[str]]:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    # lê como CSV "genérico" (pandas pode falhar quando as linhas têm colunas diferentes)
    raw = r.text.splitlines()
    # separa por vírgula respeitando aspas via pandas python engine:
    df_raw = pd.read_csv(io.StringIO("\n".join(raw)), header=None, dtype=str, engine="python")
    df_raw = df_raw.fillna("")
    return df_raw.values.tolist()

def normalizar(s: str) -> str:
    return (s or "").strip().upper()

def achar_linha_titulo(rows, titulo):
    titulo = normalizar(titulo)
    for i, row in enumerate(rows):
        if any(normalizar(cell) == titulo for cell in row):
            return i
    return None

def extrair_bloco(rows, start_idx, end_idx):
    bloco = rows[start_idx:end_idx]
    # remove linhas totalmente vazias
    bloco = [r for r in bloco if any(str(c).strip() for c in r)]
    if len(bloco) < 2:
        return pd.DataFrame()

    # heurística: primeira linha "útil" após o título vira cabeçalho
    # encontra a linha do cabeçalho: a primeira linha com pelo menos 2 células preenchidas
    header_i = None
    for i in range(len(bloco)):
        filled = sum(1 for c in bloco[i] if str(c).strip())
        if filled >= 2:
            header_i = i
            break
    if header_i is None or header_i + 1 >= len(bloco):
        return pd.DataFrame()

    header = [str(c).strip() for c in bloco[header_i] if str(c).strip() != ""]
    data_rows = bloco[header_i + 1 :]

    # corta cada linha no tamanho do header
    clean_rows = []
    for r in data_rows:
        vals = [str(c).strip() for c in r]
        vals = vals[: len(header)]
        # pula linhas vazias
        if any(v for v in vals):
            clean_rows.append(vals)

    return pd.DataFrame(clean_rows, columns=header)

def render_tabela(titulo, df):
    st.subheader(titulo)
    if df is None or df.empty:
        st.info("Sem dados para exibir.")
        return
    st.dataframe(df, use_container_width=True, hide_index=True)

st.title("Painel NIR – Censo Diário")

col_btn, _ = st.columns([1, 6])
with col_btn:
    if st.button("Atualizar agora"):
        st.cache_data.clear()

try:
    rows = baixar_linhas_csv(CSV_URL)
except Exception:
    st.error("Não foi possível carregar a planilha (CSV). Verifique se o link continua acessível sem login.")
    st.stop()

# localizar títulos e definir intervalos
idxs = {}
for t in TITULOS:
    i = achar_linha_titulo(rows, t)
    if i is not None:
        idxs[normalizar(t)] = i

# escolhe o conjunto principal de 4 títulos (priorizando com acento)
ordem = ["ALTAS", "VAGAS RESERVADAS", "CIRURGIAS PROGRAMADAS", "TRANSFERÊNCIAS SAIDAS"]
if "TRANSFERÊNCIAS SAIDAS" not in idxs and "TRANSFERENCIAS SAIDAS" in idxs:
    ordem[-1] = "TRANSFERENCIAS SAIDAS"

faltando = [t for t in ordem if normalizar(t) not in idxs]
if faltando:
    st.warning("Não encontrei os títulos de todas as tabelas no CSV. Confirme se na Folha1 existem exatamente estes títulos em uma célula: " + ", ".join(faltando))

# extrair blocos por intervalo
posicoes = [(t, idxs[normalizar(t)]) for t in ordem if normalizar(t) in idxs]
posicoes.sort(key=lambda x: x[1])

blocos = {}
for j, (titulo, start) in enumerate(posicoes):
    end = posicoes[j + 1][1] if j + 1 < len(posicoes) else len(rows)
    blocos[titulo] = extrair_bloco(rows, start + 1, end)  # start+1 para pular a linha do título

# layout “dashboard” 2x2
c1, c2 = st.columns(2)
with c1:
    render_tabela("ALTAS", blocos.get("ALTAS", pd.DataFrame()))
with c2:
    render_tabela("VAGAS RESERVADAS", blocos.get("VAGAS RESERVADAS", pd.DataFrame()))

c3, c4 = st.columns(2)
with c3:
    render_tabela("CIRURGIAS PROGRAMADAS", blocos.get("CIRURGIAS PROGRAMADAS", pd.DataFrame()))
with c4:
    render_tabela("TRANSFERÊNCIAS SAÍDAS", blocos.get(ordem[-1], pd.DataFrame()))

st.caption("Fonte: Google Sheets (Folha1). Atualização automática a cada 60s.")
