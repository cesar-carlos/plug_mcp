---
name: se7e-treinamento-administracao
description: Orientar treinamento e acompanhar operações SQL e ações externas publicadas e autorizadas da persona conectada.
metadata:
  runtime: persona-v2
  tools:
    [
      obter_contexto_persona,
      diagnosticar_permissoes,
      obter_skill,
      listar_rascunhos,
      criar_rascunho_skill,
      editar_rascunho_skill,
      obter_testes_skill,
      editar_caso_skill,
      obter_template_treinamento,
      criar_rascunho_de_template,
      revisar_publicacao_skill,
      publicar_skill,
      preparar_operacao,
      executar_operacao,
      obter_operacao,
      cancelar_operacao,
      conciliar_operacao,
      iniciar_cadastro_fonte,
      iniciar_rotacao_credenciais_fonte,
      iniciar_rotacao_token_persona,
      iniciar_emissao_token_persona,
      iniciar_cadastro_integracao,
      iniciar_rotacao_credenciais_integracao,
      listar_operacoes_externas,
      preparar_acao_externa,
      executar_acao_externa,
      obter_acao_externa,
      cancelar_acao_externa,
      conciliar_acao_externa,
    ]
---

Para emissão solicitada, use `iniciar_emissao_token_persona` somente quando descoberta. Proponha nome, expiresAt explícito, permissions e delegation limitados ao teto concedido; nunca envie Bearer. O responsável revisa a proposta imutável e confirma no navegador. Não amplie escopo, prazo ou capacidade de delegar. Link não emite token: apenas o POST autenticado pode criar e mostrar o segredo uma vez. Mudanças exigem novo link; resposta perdida exige localizar/revogar o token pelo console, sem reenvio automático.

Quando solicitado e descoberto com gerenciar_tokens, `iniciar_rotacao_token_persona` recebe objeto vazio e abre setup para rotacionar somente o token originador. O responsável reautentica e confirma no navegador. O Bearer anterior e todas as conexões OAuth derivadas serão revogados; permissões e validade permanecem iguais. O novo Bearer aparece apenas uma vez no navegador, nunca no chat ou em tools. Não conclua o formulário pelo usuário. Se perder a resposta, use o console autenticado; não repita o setup consumido. Isso não rotaciona tokens de outras pessoas nem aprova lançamentos.

Confira `obter_contexto_persona` e as concessões por `diagnosticar_permissoes`. Ferramentas administrativas só podem ser usadas quando descobertas e concedidas, com delegação ativa do responsável no hub. OAuth v2 exige consentimento explícito para a permissão administrativa correspondente. Ausência da ferramenta não autoriza chamada direta, autoelevação ou contrato legado como substituto; use o console autenticado para revisar o acesso.

Para treinamento solicitado, use `listar_rascunhos` e os schemas descobertos de `criar_rascunho_skill` ou `editar_rascunho_skill`. Fixe a fonte concedida, dialeto e estrutura fornecida; não invente tabelas, campos ou significado. Edição exige expectedRevision atual. Conflito pede leitura/revisão explícita, sem sobrescrever automaticamente. Rascunho salvo não altera publicação ativa ou permissões.

Leia `obter_testes_skill` com skillId e kind (consulta, operacao_sql ou cruzamento). Confira revisão, hashes, paginação e situação dos relatórios. `editar_caso_skill` cadastra, corrige ou remove um caso declarativo por expectedRevision, usando o schema descoberto. Remoção exige pedido explícito. Não converta formatos antigos silenciosamente. A ferramenta registra o caso; somente o runner de operador executa em fixture isolada e produz evidência técnica. Não invente relatório aprovado nem use base operacional para testar lançamentos.

Quando houver referência editorial autorizada, `obter_template_treinamento` lê somente versão/hash exatos para fonte e dialeto concedidos. `criar_rascunho_de_template` importa as referências explícitas como rascunho; exemplos ficam candidatos. Não permite navegar irrestritamente na biblioteca, ler linhas de dataset, converter SQL entre motores ou herdar aprovação/concessões.

Publicação solicitada exige a permissão publicar e os casos obrigatórios atuais. O responsável define o prazo humano de revisão no console para o conteúdo exato; a IA não escolhe uma data para suprir sua ausência. Depois use `revisar_publicacao_skill`, apresente alterações e avisos e confirme somente o hash vigente com `publicar_skill`. Preview expira em quinze minutos; alteração de conteúdo/autoridade exige nova revisão. Publicar não concede capacidades novas aos tokens nem aprova lançamentos. Aprovação semântica não decorre de execução bem-sucedida.

Quando solicitado e autorizado por gerenciar_fontes, use `iniciar_cadastro_fonte` sem argumentos para obter um link temporário. Para rotacionar a credencial da mesma base, use `iniciar_rotacao_credenciais_fonte` com `fonteId` e `expectedVersion` atuais. Compartilhe o link integral com o responsável; não abra nem preencha credenciais por ferramentas ou conversa. Esses setups exigem delegação vigente no hub e nova autenticação do responsável no navegador. Expiram em até 15 minutos, têm uso único e não concedem automaticamente acesso à nova fonte. Não tente concluir um setup de outra persona nem reassociar treinamento pela rotação.

Exemplos SQL são enviados explicitamente para treinamento. Uma consulta comum não é capturada automaticamente. O conhecimento compartilhado depende de catálogo concedido, versão publicada e compatibilidade comprovada; adoção executável fixa versões e evidências explicitamente, sem atualização automática. Execução bem-sucedida não aprova significado de negócio. Atualizar rascunho não altera publicação ativa nem amplia tokens.

Leia `obter_skill` antes de um lançamento. Use `preparar_operacao` para criar conteúdo imutável dentro de uma operação SQL publicada. Apresente resumo e exigência de aprovação. Quando exigida, aprovação é dada pelo responsável no console para o conteúdo exato; confirmação na conversa não substitui essa aprovação.

Use `executar_operacao` somente para a preparação vigente autorizada. A operação usa uma fonte e transação; SELECT continua somente leitura. Não solicite DDL, scripts livres ou escrita distribuída. Mudança de conteúdo ou autorização exige nova preparação.

Depois de timeout ou resultado desconhecido, use `obter_operacao` para acompanhar. `cancelar_operacao` solicita cancelamento e não comprova rollback. `conciliar_operacao` procura a evidência treinada sem reenviar a escrita. Nunca reexecute uma operação incerta nem fabrique comprovante, contagem ou prova de rollback.

Para ações externas solicitadas, leia o contrato de `listar_operacoes_externas` e prepare com `preparar_acao_externa({skillId,input,limits?})`. Apresente efeitos, validade e exigência de aprovação. O responsável aprova somente no console Integrações, para o fingerprint exato; consentimento na conversa ou booleano não substitui essa aprovação. Execute somente `executar_acao_externa({operationId,fingerprint})` vigente, sem alterar conteúdo. Use `obter_acao_externa` para estado/comprovante; `cancelar_acao_externa` só cancela antes do envio. Timeout ou desconhecido nunca autoriza reenvio. O comprovante confirma resposta técnica, sem provar todos os efeitos comerciais. Se o contrato possuir reconciliationCheck, use `conciliar_acao_externa({operationId,fingerprint})`: a leitura usa a chave original e registra evidência separada, sem alterar receipt nem permitir reenvio. Evidência inconclusiva, ausência ou falha nunca prova ausência de efeito. Sem essa configuração publicada, solicite investigação manual.

Quando solicitado, `iniciar_cadastro_integracao` e `iniciar_rotacao_credenciais_integracao` abrem setups protegidos. Exigem gerenciar_integracoes, delegação vigente e consentimento OAuth aplicável. Informe o link ao responsável para credenciais e confirmação somente no navegador; não preencha o formulário. Setup não publica contrato, concede acesso ou executa a integração.

Não peça senhas, tokens ou JWT na conversa. OAuth v2 delega somente o subconjunto consentido das capacidades do consumidor. Use somente ferramentas efetivamente descobertas; setups de fontes e rotação do próprio token seguem os requisitos acima. A rotação não autoriza emissão; a emissão limitada usa o setup próprio descrito acima. Integrações não são autorizadas por esses setups. Aprovação humana nunca é delegada pelo consentimento. Setups de integrações usam gerenciar_integracoes, consentimento e delegação vigentes; credencial própria somente no navegador. Ações externas seguem o fluxo separado acima, sem retry. A homologação pública dos provedores e as jornadas restantes do plano continuam pendentes. A conciliação treinada é explícita e nunca repete efeitos. A instalação privada do plugin no ChatGPT exige evidência própria, além dos testes locais.
