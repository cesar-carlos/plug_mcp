# Fixture do plugin sob diretório build — 2026-10-23

## Falha reproduzida

O helper da suíte de validação excluía qualquer caminho contendo um segmento
`build`, incluindo os ancestrais do checkout. Ao copiar uma origem instalada
sob esse diretório, não criava sequer a raiz de destino. O empacotador falhava
por `ENOENT`; isso não demonstrava falha no contrato ou no runtime do plugin.

Uma regressão cria cópia privada sob `build/plugin-source`, acrescenta um
artefato gerado interno e tenta novamente copiar, montar e validar o pacote.
Antes da correção, o caso falhou por destino ausente; os outros 25 casos ficaram
fora do filtro dessa reprodução.

## Correção e resultado

O helper agora compara caminhos relativos à origem. Não ignora ancestrais e
continua excluindo `build` interno. O pacote resultante passa pelo empacotador
e validador reais; a regressão também verifica ausência do diretório gerado na
cópia. Nenhuma assertion anterior foi retirada e nenhum validador foi relaxado.

Os **26 casos** da família passaram sem filtro ou omissões, em **2,06 segundos**,
com Node 24 do projeto. Lint dirigido e tipos passaram. Arquivos temporários
são sintéticos e removidos pelo helper com conferência de escopo.

Somente `tests/unit/plugin-package-validation.test.ts` mudou no código.
Não altera os pacotes, runtime, contratos, credenciais ou imagem candidata.
Não certifica instalação privada no cliente ChatGPT nem os gates de produção;
HTTPS/ChatGPT continuam manuais e o manifesto conserva `ready:false`.
