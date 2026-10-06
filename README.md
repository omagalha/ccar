# C CAR

Site estático responsivo, feed com destaques do estoque, catálogo com busca e filtros, detalhes com galeria e painel conectado ao Supabase por Auth / REST / Storage. Não contém estoque fictício. A abertura inclui uma simulação da fachada finalizada, baseada na referência fornecida pelo usuário e identificada como prévia. O poste central e os carros externos foram removidos da simulação.

Cada card do catálogo abre uma página própria em `veiculo.html?id=...`, com galeria ampla, ficha resumida, descrição, contato por WhatsApp e sugestões da mesma categoria. A abertura registra a visualização anônima usada nos insights do painel.

## Continuar pelo computador

1. Crie um projeto Supabase próprio.
2. Execute, nesta ordem, `supabase-setup.sql`, `supabase-private.sql`, `supabase-contract-fields.sql`, `supabase-company-lock.sql` e `supabase-insights.sql` no SQL Editor de um projeto novo.
3. Em Authentication, desative cadastro público. Crie ou convide os usuários da equipe e autorize cada UUID em `admin_users` conforme o comentário no SQL. Ter uma conta não dá acesso de administrador.
4. Edite `dist/config.js` com a URL do projeto e sua chave pública anon (ou publishable). Nunca use service_role ou secret no frontend. Configure WhatsApp com código do país e DDD, e endereço real.
5. Publique a pasta `dist`. Não há instalação ou compilação obrigatória. Qualquer hospedagem estática HTTPS é compatível.

## Painel administrativo e insights

O acesso da equipe abre `admin.html`, uma área administrativa responsiva organizada em abas. A visão geral traz indicadores do negócio, gráfico temporal de audiência, situação do estoque, ranking por veículo e pendências operacionais. A aba de estoque oferece busca, filtros, alteração rápida de status, duplicação como rascunho, edição, fotos, dados privados e geração de Word. As fotos podem ser reordenadas por arrastar ou pelos botões direcionais; a primeira é sempre a capa. A duplicação não reutiliza fotos para evitar que a exclusão de um anúncio quebre outro.

Execute `supabase-insights.sql` depois dos quatro scripts de estrutura. Ele acrescenta datas de atualização/publicação e métricas agregadas por veículo. Uma visualização é registrada ao abrir os detalhes; um contato é registrado ao clicar no WhatsApp de um veículo. Cada navegador conta no máximo uma ação de cada tipo por veículo por dia. Não são armazenados IP, user-agent, localização ou outros dados pessoais. As métricas detalhadas só podem ser consultadas por usuários presentes em `admin_users`.

## Fotos e privacidade

O upload preserva os bytes originais JPEG/PNG/WebP, até 15 MB por foto e 30 fotos por veículo. A primeira foto é a capa. Bucket público: todas as fotos enviadas, inclusive rascunhos, podem ser vistas por quem tiver a URL. Use apenas fotos destinadas ao anúncio, nunca documentos ou imagens confidenciais. Os dados dos rascunhos ficam restritos aos administradores por RLS.

Esta primeira versão exibe os originais via CDN; lazy loading reduz downloads iniciais. Próxima etapa: thumbnails WebP para catálogo, versões de 1600–2000 px para galeria e original preservado. Transformações nativas do Supabase dependem do plano. Pode-se gerar as versões no navegador sem alterar o original.

## Estado e validação

Sem `config.js` preenchido, o site mostra estoque vazio e entrada desativada. Não há login de demonstração ou senha embutida. Com projeto configurado, o painel permite adicionar/editar/excluir veículos, remover fotos e marcar rascunho/disponível/vendido e destaque no feed. Sessões ficam em sessionStorage com renovação de token; a autorização real é aplicada pelas políticas RLS.

O backend Supabase precisa ser provisionado e testado com contas admin/não admin antes de produção. Nenhuma conta externa foi criada nesta etapa. A versão hospedada começa privada para revisão.

## Ficha privada e Word

Execute também `supabase-private.sql` depois do SQL inicial. Essa atualização cria `vehicle_private` e `company_settings` com RLS e sem acesso para visitantes. Atualmente todos os administradores autorizados em `admin_users` têm acesso à documentação; funções distintas para vendedor/documentação podem ser acrescentadas posteriormente.

No painel: `Dados da loja e representante` configura cabeçalho textual. Cada veículo tem `Dados privados / Word` para placa, chassi, Renavam, cor, proprietário, documento do proprietário, custo e observações internas. A geração salva a ficha e exige razão social/CNPJ/endereço/representante preenchidos.

O Word gerado é uma **ficha para documentação**, com dados da loja/representante, dados do carro, campos vazios de comprador e condições. Não contém custo, documento do proprietário anterior ou observações internas. É um modelo inicial; um contrato ou outro documento específico pode ser substituído pelo modelo fornecido pela loja.

A logo dourada está ancorada atrás do texto no cabeçalho, centralizada na página, com opacidade reduzida. A geração DOCX ocorre no navegador e não envia dados para terceiros. Arquivo ZIP/OOXML e abertura com python-docx foram verificados; aparência final da marca d’água precisa ser conferida no Microsoft Word.

`admin-preview.html` é uma demonstração separada, sem banco, sem dados reais e sem persistência, para avaliar os campos e baixar um Word de teste pelo celular. Não concede acesso ao painel real. `examples/C-CAR-modelo-documentacao.docx` contém somente dados fictícios.

## Cadastro único e bloqueado da empresa

Execute `supabase-company-lock.sql` como última etapa. Ele preenche o registro único id=1 com nome empresarial, CNPJ e endereço do comprovante fornecido e revoga INSERT/UPDATE/DELETE da equipe, inclusive administradores. Só há leitura via RLS para administradores autorizados. No frontend os campos são readonly, sem botão para salvar.

O site mantém a marca C CAR; no comprovante, o nome de fantasia é CHAVES AUTOMOVEIS e o nome empresarial é ELIDIA POSSIDENTE GARCIA CHAVES. O representante da documentação não foi inferido da titularidade do CNPJ. Seu nome e função podem ser configurados uma vez pelo responsável técnico no banco depois de confirmados; até lá ficam em branco no Word para preenchimento.

Esta seção substitui a instrução anterior sobre editar dados da loja no painel. O painel agora apenas consulta os dados fixos. A geração usa o registro único automaticamente para veículos presentes e futuros. Alterações oficiais do cadastro ficam fora do painel da equipe. As permissões efetivas dependem de aplicar os três SQLs na ordem indicada.

## Contrato de compra e venda

O gerador também oferece o contrato baseado no PDF enviado, com as cláusulas preservadas e os dados do comprador/venda anterior removidos. Comprador, valor negociado, pagamento, sinal, qualificação do representante e data ficam como campos editáveis. Não se utiliza preço anunciado como preço da venda nem como sinal, porque são valores distintos. Campos automáticos: loja, veículo e identificação privada. Execute `supabase-contract-fields.sql` por último para os campos adicionais (fabricação, motor, categoria documental, potência/cilindrada).

O documento é marcado como minuta para conferência. Não houve revisão jurídica das cláusulas. Pontos encontrados no modelo original: o prazo de 30 dias atribuído ao art. 26, II, CDC diverge dos 90 dias previstos para produtos duráveis; cláusulas de exclusão de vícios ocultos e garantia limitada precisam de revisão. O endereço da vendedora no contrato enviado (Av. Getúlio Vargas, 481, São Félix) difere do comprovante CNPJ; o cadastro fixo continua com o endereço do comprovante até confirmação. A qualificação do representante e seus poderes ficam em branco, sem atribuir automaticamente condição societária.

O exemplo `examples/C-CAR-contrato-teste.docx` usa somente informações fictícias. Estrutura OOXML, presença das 14 cláusulas e ausência de dados do comprador anterior foram verificadas.
