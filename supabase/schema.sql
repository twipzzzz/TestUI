-- ============================================================================
-- Controle Financeiro — Schema do Supabase
-- ============================================================================
-- Como usar: abra seu projeto em https://supabase.com, vá em "SQL Editor",
-- cole este arquivo inteiro e clique em "Run". Isso cria as tabelas, as
-- regras de segurança (Row Level Security) e a automação que prepara a
-- conta de cada novo usuário.
--
-- IMPORTANTE: a autenticação (login/senha, tokens, etc.) já é 100% cuidada
-- pelo Supabase Auth através da tabela `auth.users` — não precisamos criar
-- nada para isso. Este arquivo só cria as tabelas do NOSSO app e as amarra
-- ao usuário logado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PROFILES — dados de exibição de cada usuário (nome, ícone, cor)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    nome       text not null,
    icone      text not null default '👤',
    cor        text not null default '#4F46E5',
    criado_em  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "usuarios veem o proprio perfil"
    on public.profiles for select
    using (auth.uid() = id);

create policy "usuarios atualizam apenas o proprio perfil"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 2) CATEGORIAS — cada usuário tem seu próprio conjunto de categorias
-- ----------------------------------------------------------------------------
create table if not exists public.categorias (
    id         bigint generated always as identity primary key,
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    nome       text not null,
    tipo       text not null check (tipo in ('Receita', 'Despesa', 'Ambos')),
    unique (user_id, nome)
);

alter table public.categorias enable row level security;

create policy "usuarios gerenciam as proprias categorias"
    on public.categorias for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) LANCAMENTOS — cada usuário só enxerga e mexe nos próprios lançamentos
-- ----------------------------------------------------------------------------
create table if not exists public.lancamentos (
    id         bigint generated always as identity primary key,
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    data       date not null,
    descricao  text not null,
    tipo       text not null check (tipo in ('Receita', 'Despesa')),
    categoria  text not null,
    valor      numeric(12, 2) not null check (valor > 0),
    criado_em  timestamptz not null default now()
);

create index if not exists lancamentos_user_data_idx
    on public.lancamentos (user_id, data desc);

alter table public.lancamentos enable row level security;

create policy "usuarios gerenciam os proprios lancamentos"
    on public.lancamentos for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) Categorias padrão + criação automática de perfil ao cadastrar usuário
-- ----------------------------------------------------------------------------
create or replace function public.lidar_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, nome)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1))
    );

    insert into public.categorias (user_id, nome, tipo)
    values
        (new.id, 'Salário', 'Receita'),
        (new.id, 'Investimentos', 'Receita'),
        (new.id, 'Freelance', 'Receita'),
        (new.id, 'Outras Receitas', 'Receita'),
        (new.id, 'Moradia', 'Despesa'),
        (new.id, 'Alimentação', 'Despesa'),
        (new.id, 'Transporte', 'Despesa'),
        (new.id, 'Saúde', 'Despesa'),
        (new.id, 'Educação', 'Despesa'),
        (new.id, 'Lazer', 'Despesa'),
        (new.id, 'Assinaturas', 'Despesa'),
        (new.id, 'Vestuário', 'Despesa'),
        (new.id, 'Outras Despesas', 'Despesa');

    return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
    after insert on auth.users
    for each row execute function public.lidar_novo_usuario();
