# Vales, pedras e evolução até a 1.0

Atualizado em 23/11/2026. Esta etapa prepara um fluxo que uma pessoa possa experimentar e que Caetano consiga explicar no portfólio: ganhar um vale, escolher como resgatá-lo, ver o resultado na Pokédex e recuperar o progresso após reabrir. O foco de aprendizagem é acompanhar a mesma regra da interface ao banco e verificar o que ocorre se o pedido for repetido ou interrompido.

## Escopo acordado

- A 1.0 terá vale Pokémon, vale pedra e vale de giros. Vale de tipo e amuleto shiny ficam para depois. As cinco opções equiprováveis permanecem como cenário da prévia anterior para estudos. As chances entre os três tipos da 1.0 continuam abertas.
- O vale Pokémon registra a variante normal escolhida. Possuir apenas a shiny permite a troca. O custo de 1 a 4 usa os grupos provisórios de raridade. O vale de giros continua com a referência de 2 giros para testes.
- O jogador escolhe a pedra ao trocar o vale pedra. O primeiro protótipo de evolução cobre as 16 compatibilidades clássicas já mapeadas. Cada evolução bem-sucedida consome uma pedra, mantém a origem disponível e registra a variante correspondente no destino. Se essa variante já estiver registrada, a pedra é preservada. O Eevee pode evoluir por mais de uma ramificação.
- As 56 adaptações propostas pelo tipo principal da origem ficam para revisão depois da fatia clássica. O catálogo e os valores finais serão fechados com os resultados do balanceamento.

## Como as três entregas se encaixam

| Parte | O que reaproveita | Entrega verificável |
| --- | --- | --- |
| 1. Vales | Linhas vencedoras, inventário SQLite, resgate local e tabela de raridades | Escolher a espécie com custo e estoque visíveis. Retomar um resgate incerto após recarregar. Guardar os três tipos da 1.0 de acordo com a distribuição escolhida. |
| 2. Pedras e evolução | Inventário da parte 1, variantes da Pokédex e 16 receitas no servidor | Trocar um vale pela pedra escolhida em uma operação. Em outra, gastar a pedra compatível e registrar o destino. Reabrir e conferir estoque e coleção. |
| 3. Integração à conta | Neon Auth, função existente e trava por jogador no PostgreSQL | Ganhar, resgatar e evoluir na conta fictícia do branch isolado. Confirmar saldo, inventário e variantes por identidade, inclusive após falha ou concorrência. |

O vale de giros credita saldo na própria rodada. O vale Pokémon e o vale pedra entram no inventário. O vale Pokémon leva direto à Pokédex, enquanto o vale pedra gera uma pedra que pode ser usada à parte. A separação permite guardar uma pedra hoje e escolher outra espécie para evoluir depois.

## Revisão do código e sequência de implementação

1. **Seleção de Pokémon, implementada.** A prévia local tem uma lista de Kanto e usa a mesma regra de custo do servidor. Um pedido à PokéAPI fornece os nomes. A lista por número permite continuar se a consulta falhar. A decisão de autorizar e debitar a troca continua no SQLite.
2. **Recuperação de resgate, implementada localmente.** A intenção e seu identificador ficam guardados para que uma resposta incerta possa ser recuperada após recarregar. O armazenamento compartilhado coordena as ações nas abas atualizadas; operações legadas também são recuperáveis.
3. **Troca por pedra, implementada localmente.** O SQLite valida a escolha e salva débito, crédito e resultado na mesma transação. A prévia usa as pedras das receitas clássicas.
4. **Evolução clássica, implementada localmente.** O servidor valida origem, variante, receita e estoque, debitando a pedra e registrando o destino juntos. A prévia mostra as opções para variantes registradas; as demais receitas aguardam revisão.
5. **Inventários e ações no PostgreSQL isolado.** Hoje a função autenticada gera rodadas e persiste giros e variantes. Em incrementos separados, incluir inventários no estado, emitir vales na transação da rodada e portar primeiro a troca Pokémon, depois a troca de pedra e a evolução. A identidade vem da sessão validada. Cada operação mutável deve vincular o identificador à conta, à ação e aos parâmetros. A repetição devolve o resultado original. Preservar as rodadas antigas com campos opcionais e testar o estado de uma conta sem itens.
6. **Fluxo completo no aplicativo.** Conectar as operações autenticadas à interface em PT/EN. Verificar os caminhos feliz e de recuperação com duas contas fictícias no navegador, incluindo troca de conta durante uma resposta pendente. A correção da checagem de sessão já tem teste controlado. Fazer um ensaio de teclado, celular e falha na consulta à PokéAPI antes de fechar este bloco.

SQLite e PostgreSQL continuam responsáveis por suas próprias transações. Compartilhar consultas puras e catálogos quando houver uso real dos dois lados. A interface usa o catálogo para orientar a escolha e reaproveita a resposta gravada para mostrar o efeito. Uma camada genérica de inventário ou uma migração geral da prévia agregaria trabalho antes de termos os fluxos reais para comparar. À medida que cada painel ganhar ações próprias, extrair sua apresentação de `src/preview/main.js`.

Para revisão de cada mudança, usar os testes do domínio e da persistência e uma verificação manual da ação apresentada. Separar o que foi observado em ambiente isolado, simulado e pendente. Mudanças de comportamento e correções independentes devem ter commits identificáveis. A IA apoiou a revisão e a implementação. Caetano definiu escopo e regras. Uma prática para a próxima etapa é acompanhar o caminho vale → estoque → registro de operação e explicar por que uma segunda tentativa devolve o resultado anterior.

As partes 4, 5 e 6 do plano geral seguem após este bloco: balanceamento final, experiência completa e preparação da publicação. O trabalho local reutiliza dependências instaladas e o ambiente isolado existente. Reavaliar as condições gratuitas antes de novas alterações no serviço.
