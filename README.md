# PokéSlot

Projeto de aprendizagem para construir uma máquina de três rolos inspirada em jogos de Pokémon. O projeto é pessoal, sem finalidade de venda, e está em desenvolvimento.

## Direção do projeto

**Caetano Coimbra idealiza e dirige o PokéSlot.** Ele definiu a experiência do jogador, as regras de progressão e o escopo de Kanto. Conduz as decisões técnicas e de produto, organiza a implementação em entregas verificáveis e participa dos testes da máquina com contas fictícias.

- **Produto e balanceamento.** Definiu o ciclo de 20 giros iniciais e reposição de 10 a cada 24 horas. Propôs os vales para dar ao jogador mais controle sobre o fim da coleção e orientou a comparação de cenários antes de definir os pesos finais.
- **Arquitetura e critérios de qualidade.** Escolheu avançar com Neon após a prova de identidade e persistência. Priorizou que o progresso sobreviva à reabertura e que uma operação pendente possa ser retomada com segurança.
- **Validação prática.** Participou do ensaio com duas contas na mesma máquina, entrando como C e B para verificar a recuperação da coleção e a separação do inventário.

O trabalho usa IA como apoio em pesquisa, implementação, revisão e preparação dos testes, sob a direção de Caetano.

## Estado atual

O código inclui uma **prova técnica de identidade e saldo** e versões experimentais da máquina e da Pokédex. O jogo completo ainda está em desenvolvimento. As provas usam dados fictícios; o saldo inicial e a reposição definidos para o jogo são aplicados na prévia local e no backend autenticado isolado.

A regra inicial dos três rolos está em desenvolvimento: cada rolo contém 10 Pokébolas, 6 símbolos de giro e 4 vales, com embaralhamento e escolha de posição por rodada. A prévia bilíngue usa um banco SQLite local de teste: saldo e coleção sobrevivem a recarregar e reiniciar o servidor. Todos que acessam a prévia no mesmo computador compartilham o mesmo jogador fictício, sem autenticação; não é um backend seguro para publicação. A prévia usa classificações provisórias e não concede recompensas reais.

A prévia local também experimenta cinco tipos de prêmio por linha de vales com chances iguais, como hipótese de estudo. O vale de giros concede 2 giros de teste imediatamente. O vale Pokémon permite escolher uma variante normal em uma lista de Kanto que mostra o custo provisório de 1 a 4 vales por raridade. Ter apenas a shiny permite resgatar a normal. O seletor de resgate preserva os nomes e números de Kanto quando a consulta à PokéAPI falha. Um vale pedra pode ser trocado por uma pedra escolhida e usada em 16 evoluções clássicas; a origem e a variante são preservadas. Tipo e amuleto ficam guardados para estudo. A prova autenticada isolada também implementa esses inventários e ações, como descrito no [plano de vales, pedras e evolução](docs/vales-evolucao-integracao.md).

Para o jogo, a regra em desenvolvimento prevê saldo inicial de 20 giros e reposição de 10 a cada período completo de 24 horas, acumulada durante a ausência. A prévia local e a prova autenticada isolada aplicam essa regra com o relógio de seus respectivos servidores. A máquina apresenta o próximo horário e permite atualizar o saldo; o horário apresentado não concede giros por si só.

A primeira versão está planejada com as 151 espécies de Kanto e uma interface bilíngue em português e inglês, com alternância pelo jogador. A prévia local sorteia as espécies com chances iguais para testes. A prova Neon aplica os parâmetros iniciais aprovados para a 1.0 e persiste as variantes por conta fictícia. Ambas consultam a PokéAPI para mostrar detalhes. Na Pokédex, uma espécie ainda não registrada aparece como silhueta numerada. Obter a variante normal ou shiny revela o nome e libera a ficha para aquela conta. Os cartões usam duas folhas de sprites e um índice de nomes incluídos na prévia, de modo que a galeria continua legível quando o serviço externo falha. O script `scripts/gerar-sprites-kanto.ps1` recompõe esses recursos a partir de revisões fixas dos [sprites](https://github.com/PokeAPI/sprites) e do [catálogo da PokéAPI](https://github.com/PokeAPI/pokeapi). Veja as regras e os cenários comparados no [plano de vales, pedras e evolução](docs/vales-evolucao-integracao.md).

Foram experimentados Neon Auth, PostgreSQL, Neon Data API e uma Neon Function em um branch de teste. A Data API apresentou falha intermitente de contexto de identidade; a causa não foi identificada. A função alternativa passou em cenários pontuais de recuperação de saldo, repetição e concorrência, mas a arquitetura para publicação e os privilégios de acesso ainda precisam de revisão. A comparação prática com Supabase foi interrompida por decisão do autor e não constitui resultado para aquela plataforma.

A prova em `proof-identity-safe` integra autenticação, rodada, débito e coleção no PostgreSQL isolado. A função gera a rodada no servidor e registra o resultado junto com o débito. Uma operação repetida recupera o mesmo resultado. A máquina autenticada sorteia três tipos de vale com chances iguais por linha premiada. O jogador pode resgatar Pokémon e trocar o vale pedra por uma das 14 pedras usadas nas 72 evoluções de Kanto. Abra a prova em `http://localhost:5173/previa-maquina.html?backend=neon`, com as variáveis públicas de teste e uma conta fictícia. Sem o parâmetro, a prévia usa o ambiente local. A publicação depende da revisão de privilégios, retenção e recuperação.

## Organização da prova

- `src/domain/`: cálculo ilustrativo dos períodos de reposição.
- `src/identity/`: interface e mecanismos usados nas verificações de identidade.
- `functions/neon-authenticated-proof/`: API experimental que valida a identidade.
- `functions/neon-game-proof/` e `db/neon/isolated_game.sql`: rodada transacional experimental para o branch isolado.
- `db/neon/`: esquemas e consultas da prova. Alguns scripts são restritos ao branch isolado indicado neles.
- `test/`: verificações locais com dados e dependências simulados quando indicado no próprio teste.

## Executar localmente

Requer Node.js compatível com `node:sqlite` e as dependências em `pnpm-lock.yaml` (a prévia foi testada com Node 26.13.1), além de pnpm. Instale com `pnpm install --frozen-lockfile` e execute `pnpm dev`. O endereço exibido pelo Vite deve ser aberto com `localhost`: a configuração de autenticação de teste pode tratar `127.0.0.1` como outra origem.

Para experimentar a rodada demonstrativa, abra `http://localhost:5173/previa-maquina.html` enquanto o servidor local de desenvolvimento estiver em execução. Se a porta estiver ocupada, use a porta informada pelo Vite. A API de demonstração existe apenas nesse servidor; o build estático não oferece rodadas nem constitui um backend de produção.

Os fluxos conectados também exigem infraestrutura Neon configurada. Copie `.env.example` para `.env.local` e informe os endereços públicos apropriados para cada branch. Variáveis `VITE_` são expostas ao navegador: nunca coloque senhas, tokens, chaves ou strings de conexão nelas. Os scripts SQL devem ser revisados antes de qualquer execução; não são migrações prontas para produção.

As verificações locais existentes podem ser executadas com `node --test test/*.test.mjs`. Elas não substituem testes integrados de contas, rede, autorização e segurança.
