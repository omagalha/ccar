-- Execute depois de supabase-setup.sql e supabase-private.sql.
-- Cadastro extraído do comprovante CNPJ enviado em 05/10/2026.
-- Nome de fantasia no comprovante: CHAVES AUTOMOVEIS.
-- A marca de apresentação do site é C CAR; o documento usa o nome empresarial.
insert into public.company_settings (id,legal_name,cnpj,address,representative,representative_role)
values (1,'ELIDIA POSSIDENTE GARCIA CHAVES','26.722.007/0001-00','Estrada Pádua–Pirapetinga, RJ-186, km 24, s/n, lote 9, quadra A, Arraialzinho, 2º Distrito, Santo Antônio de Pádua – RJ, CEP 28.470-000','','')
on conflict (id) do update set legal_name=excluded.legal_name,cnpj=excluded.cnpj,address=excluded.address;

-- Nem administradores autenticados podem modificar pelo aplicativo.
revoke all on public.company_settings from anon, authenticated;
grant select on public.company_settings to authenticated;
drop policy if exists "Only authorized admins access company settings" on public.company_settings;
create policy "Authorized admins read fixed company data" on public.company_settings for select to authenticated using (public.is_ccar_admin());

-- Responsável pela documentação não consta do comprovante enviado.
-- Depois de definido, configurar por canal administrativo no SQL Editor:
-- update public.company_settings set representative='NOME CONFIRMADO', representative_role='FUNÇÃO CONFIRMADA' where id=1;
-- O painel não fornece edição do cadastro da loja.
