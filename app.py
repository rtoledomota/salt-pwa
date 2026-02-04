import pandas as pd
import streamlit as st
from streamlit_autorefresh import st_autorefresh

st.set_page_config(page_title="Painel NIR", layout="wide")

CSV_URL = "https://docs.google.com/spreadsheets/d/1wA--gbvOmHWcUvMBTldVC8HriI3IXfQoEvQEskCKGDk/gviz/tq?tqx=out:csv&sheet=Folha1"

st_autorefresh(interval=60_000, key="nir_autorefresh")  # 60s

@st.cache_data(ttl=30)
def carregar(url: str) -> pd.DataFrame:
    df = pd.read_csv(url)

    # Tipagem opcional para colunas numéricas comuns (não quebra se não existirem)
    for col in ["altas_do_dia_ate_19h_", "altas_previstas_24h"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    return df

st.title("Painel NIR – Censo Diário")

col1, col2 = st.columns([1, 6])
with col1:
    if st.button("Atualizar agora"):
        st.cache_data.clear()

df = carregar(CSV_URL)

st.dataframe(df, use_container_width=True, hide_index=True)
st.caption("Fonte: Google Sheets (CSV). Atualização automática a cada 60 segundos.")