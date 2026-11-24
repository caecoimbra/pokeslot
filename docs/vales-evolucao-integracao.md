# Vales, pedras e evolução até a 1.0

Atualizado em 23/11/2026. Esta etapa prepara um fluxo que uma pessoa possa experimentar e que Caetano consiga explicar no portfólio: ganhar um vale, escolher como resgatá-lo, ver o resultado na Pokédex e recuperar o progresso após reabrir. O foco de aprendizagem é acompanhar a mesma regra da interface ao banco e verificar o que ocorre se o pedido for repetido ou interrompido.

## Escopo acordado

- A 1.0 começa com vale Pokémon, vale pedra e vale de giros, cada um com a mesma chance por linha vencedora de vale. Vale de tipo e amuleto shiny ficam para depois. A prévia local preserva o cenário anterior de cinco tipos e o histórico autenticado pode conter itens daquela fase.
- O vale Pokémon registra a variante normal escolhida. Possuir apenas a shiny permite a troca. Os custos são 1/2/3/4 vales para comum, incomum, raro e lendário. O vale de giros credita 2 giros no ato.
- O jogador escolhe a pedra ao trocar o vale pedra. Cada evolução bem-sucedida consome uma pedra, mantém a origem disponível e registra a variante correspondente no destino. Se essa variante já estiver registrada, a pedra é preservada. O Eevee pode evoluir por mais de uma ramificação.
- Caetano aprovou as 56 adaptações pelo tipo principal da forma padrão de origem, somadas às 16 clássicas. Cada vínculo usa uma pedra, inclusive Dragonair → Dragonite com Pedra de Dragão.

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
5. **Inventários e ações no PostgreSQL isolado, implementados na prova.** A função autenticada inclui inventários no estado, emite vales na transação da rodada e oferece resgate Pokémon, troca de pedra e evolução. A identidade vem da sessão validada; a repetição devolve o resultado registrado para a mesma conta, ação e parâmetros. A hipótese de cinco vales permanece apenas para comparação. Verificações administrativas controladas e um fluxo autenticado com duas contas fictícias passaram; o estoque do fluxo positivo autenticado foi inserido para teste, não sorteado. A ligação dessas ações à interface autenticada permanece para a etapa 6.
6. **Fluxo no aplicativo, integrado à prova autenticada.** A interface apresenta inventários, resgate, troca e evolução em PT/EN. No navegador, com estoque de teste inserido no banco, C resgatou Pikachu, trocou uma pedra e evoluiu para Raichu; após recarregar os dois permaneceram na coleção. B apresentou seus próprios dados ao trocar de conta. Uma resposta de resgate descartada após chegar foi recuperada depois de recarregar sem segundo débito. Troca de conta durante uma resposta de inventário pendente foi simulada em testes automatizados, não reproduzida com contas reais no navegador. Permanecem o ensaio de teclado, celular e falha da PokéAPI, além da revisão para publicação.

SQLite e PostgreSQL continuam responsáveis por suas próprias transações. Compartilhar consultas puras e catálogos quando houver uso real dos dois lados. A interface usa o catálogo para orientar a escolha e reaproveita a resposta gravada para mostrar o efeito. Uma camada genérica de inventário ou uma migração geral da prévia agregaria trabalho antes de termos os fluxos reais para comparar. À medida que cada painel ganhar ações próprias, extrair sua apresentação de `src/preview/main.js`.

Para revisão de cada mudança, usar os testes do domínio e da persistência e uma verificação manual da ação apresentada. Separar o que foi observado em ambiente isolado, simulado e pendente. Mudanças de comportamento e correções independentes devem ter commits identificáveis. A IA apoiou a revisão e a implementação. Caetano definiu escopo e regras. Uma prática para a próxima etapa é acompanhar o caminho vale → estoque → registro de operação e explicar por que uma segunda tentativa devolve o resultado anterior.

## Economia inicial da 1.0

Caetano aprovou 70% / 22% / 7% / 1% por captura para os tiers de 50 / 61 / 34 / 6 espécies. Shiny tem 0,5% por captura, independentemente da raridade. A tabela C paga 2 giros por linha de giro e compensa repetidos com 1/1/2/3 giros por raridade, dobrados para repetidos shiny. O saldo inicial é de 20 giros e a reposição é de 10 a cada 24 horas.

O [simulador de progressão](../scripts/simular-progressao-v1.mjs) usa 1.500 trajetórias por cenário, semente fixa, saldo acumulado e estratégias de troca voltadas a espécies inéditas. Com três vales iguais e 72 receitas, a mediana para 75, 145 e 151 espécies foi de 9, 44 e 61 dias ao simular até 25 rodadas por dia. O percentil 90 para 151 foi de 77 dias. Com até 15 rodadas por dia, mediana e percentil 90 foram de 100 e 126 dias. Esses ritmos representam hábitos simulados. As regras permitem gastar o saldo disponível.

O roteiro restante está no [plano da 1.0](roteiro-1.0.md). As probabilidades começam com esses valores e podem ser revistas após testes de jogo.
