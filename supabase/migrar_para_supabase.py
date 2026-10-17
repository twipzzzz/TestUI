"""
migrar_para_supabase.py
------------------------
Gera um arquivo .sql com os lançamentos e categorias do seu `financeiro.db`
(da versão desktop) prontos para colar no SQL Editor do Supabase.

COMO USAR:
1. Rode este script na mesma pasta do seu `financeiro.db`:
       python migrar_para_supabase.py

2. Ele vai listar os perfis encontrados no banco local e pedir, para cada
   um, o UUID do usuário correspondente no Supabase (você cria as contas
   primeiro lá — Authentication > Users — e copia o UUID de cada uma, ou
   deixa os próprios usuários se cadastrarem uma vez pelo site e você pega
   o UUID depois).

3. O script gera `migracao_supabase.sql`. Abra o SQL Editor do seu projeto
   Supabase, cole o conteúdo do arquivo gerado e clique em "Run".

IMPORTANTE: rode o `supabase/schema.sql` (e crie as contas dos usuários)
ANTES de aplicar este arquivo de migração.
"""

import sqlite3
import sys
import os


def escapar_sql(texto):
    """Escapa aspas simples para uso seguro dentro de strings SQL."""
    return str(texto).replace("'", "''")


def main():
    caminho_banco = "financeiro.db"
    if not os.path.exists(caminho_banco):
        caminho_banco = input("Caminho do financeiro.db (ENTER para './financeiro.db'): ").strip() or "financeiro.db"
    if not os.path.exists(caminho_banco):
        print(f"Arquivo não encontrado: {caminho_banco}")
        sys.exit(1)

    conn = sqlite3.connect(caminho_banco)
    cur = conn.cursor()

    # Detecta se é a versão com perfis ou uma versão mais antiga (sem perfil_id)
    cur.execute("PRAGMA table_info(lancamentos)")
    colunas = [c[1] for c in cur.fetchall()]
    tem_perfis = "perfil_id" in colunas

    if tem_perfis:
        cur.execute("SELECT id, nome FROM perfis ORDER BY id")
        perfis = cur.fetchall()
    else:
        perfis = [(None, "Perfil Único (banco antigo sem perfis)")]

    if not perfis:
        print("Nenhum perfil encontrado no banco.")
        sys.exit(1)

    print("\nPerfis encontrados no banco local:")
    for pid, nome in perfis:
        print(f"  - {nome}" + (f"  (id local {pid})" if pid is not None else ""))

    mapa_uuid = {}
    print("\nAgora informe o UUID do Supabase Auth correspondente a cada perfil.")
    print("(Painel do Supabase → Authentication → Users → clique no usuário → copie o UUID)\n")
    for pid, nome in perfis:
        uuid_supabase = input(f'UUID do Supabase para "{nome}": ').strip()
        if not uuid_supabase:
            print(f'  Pulando "{nome}" (nenhum UUID informado).')
            continue
        mapa_uuid[pid] = uuid_supabase

    if not mapa_uuid:
        print("Nenhum UUID informado. Nada a gerar.")
        sys.exit(0)

    linhas_sql = [
        "-- Gerado por migrar_para_supabase.py",
        "-- Cole este conteúdo inteiro no SQL Editor do Supabase e clique em Run.",
        "-- Rode isso DEPOIS de já ter criado as contas de cada usuário no Supabase Auth.",
        "",
    ]

    total_categorias = 0
    total_lancamentos = 0

    for pid, uuid_supabase in mapa_uuid.items():
        if tem_perfis:
            cur.execute("SELECT nome, tipo FROM categorias WHERE perfil_id = ?", (pid,))
        else:
            cur.execute("SELECT nome, tipo FROM categorias")
        categorias = cur.fetchall()

        for nome, tipo in categorias:
            linhas_sql.append(
                "INSERT INTO public.categorias (user_id, nome, tipo) VALUES "
                f"('{uuid_supabase}', '{escapar_sql(nome)}', '{tipo}') "
                "ON CONFLICT (user_id, nome) DO NOTHING;"
            )
            total_categorias += 1

        if tem_perfis:
            cur.execute("SELECT data, descricao, tipo, categoria, valor FROM lancamentos WHERE perfil_id = ?", (pid,))
        else:
            cur.execute("SELECT data, descricao, tipo, categoria, valor FROM lancamentos")
        lancamentos = cur.fetchall()

        for data_iso, descricao, tipo, categoria, valor in lancamentos:
            linhas_sql.append(
                "INSERT INTO public.lancamentos (user_id, data, descricao, tipo, categoria, valor) VALUES "
                f"('{uuid_supabase}', '{data_iso}', '{escapar_sql(descricao)}', '{tipo}', "
                f"'{escapar_sql(categoria)}', {valor});"
            )
            total_lancamentos += 1

        linhas_sql.append("")

    conn.close()

    nome_saida = "migracao_supabase.sql"
    with open(nome_saida, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas_sql))

    print(f"\nPronto! Gerado '{nome_saida}' com {total_categorias} categoria(s) e "
          f"{total_lancamentos} lançamento(s).")
    print("Abra o SQL Editor do Supabase, cole o conteúdo desse arquivo e clique em Run.")


if __name__ == "__main__":
    main()
