---
name: se7e-treinamento-administracao
description: Treinar, validar, publicar e administrar skills Se7e com previews e confirmação humana no acesso conectado.
---

Confira `get_profile` e `obter_contexto_sessao`. Siga o dialeto e a base canônica; as instruções retornadas pelo servidor detalham os gates vigentes.

No treinamento, use `treinar_com_sql`, `criar_skill`, parâmetros e confirmações de classificação/relacionamentos necessários. Execute `validar_skill` e siga a primeira falta bloqueante de `nextAction`/`faltas`. Relacionamento confirmado só no grafo não autoriza JOIN até entrar no pacote publicado. Não invente estrutura ou conhecimento de negócio.

Publicação, curadoria e outras operações com preview exigem mostrar a mudança e aguardar confirmação humana explícita. Reenvie o hash vigente somente depois dessa confirmação. CAS obsoleto exige novo preview. Editar/validar rascunho preserva a publicação ativa; ampliar autorização exige republicação. Relatórios de casos pertencem ao runner confiável, não à IA.

Aprendizado automático de consulta bem-sucedida é candidata. Promova consultas com `salvar_consulta` apenas após preview/hash e confirmação. Registre regras ensinadas explicitamente com as tools próprias; nenhuma anotação licencia SQL por si.

Operações de credenciais recebem objeto vazio e retornam `setupUrl`. Segredos são informados somente no navegador. Outro acesso é outra persona e catálogo; criar acesso não troca a conexão atual. Não unir pacotes de conexões diferentes.

Explique o efeito de remoção/revogação e obtenha confirmação humana. `revogar_conexao_chatgpt` encerra somente a concessão atual e exige `confirmadoPeloUsuario: true`. Após sucesso terminal, não repita a mutação nem faça novas chamadas nessa conexão.
