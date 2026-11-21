# PokéSlot

Projeto de aprendizagem para construir uma máquina de três rolos inspirada em jogos de Pokémon. O projeto é pessoal, sem finalidade de venda, e está em desenvolvimento.

## Estado atual

O código inclui uma **prova técnica de identidade e saldo** e regras iniciais da máquina e das capturas. O jogo completo e a Pokédex ainda não estão integrados. A prova usa dados fictícios e uma reposição ilustrativa de 10 giros por período; essa quantidade não é uma regra final do jogo.

A regra inicial dos três rolos está em desenvolvimento: cada rolo contém 10 Pokébolas, 6 símbolos de giro e 4 vales, com embaralhamento e escolha de posição por rodada. A prévia bilíngue apresenta rodadas geradas pelo servidor local de desenvolvimento; elas não movimentam saldo nem concedem recompensas.

A primeira versão está planejada com as 151 espécies de Kanto e uma interface bilíngue em português e inglês, com alternância pelo jogador. Há um cliente inicial para obter e preparar dados da PokéAPI, incluindo sprites e tipos, mas ele ainda não está integrado a uma Pokédex jogável. Quando um texto não estiver disponível no idioma escolhido, sua origem e tratamento precisarão ser definidos. A quantidade de giros, as chances e outras regras de recompensa permanecem em definição.

Foram experimentados Neon Auth, PostgreSQL, Neon Data API e uma Neon Function em um branch de teste. A Data API apresentou falha intermitente de contexto de identidade; a causa não foi identificada. A função alternativa passou em cenários pontuais de recuperação de saldo, repetição e concorrência, mas a arquitetura para publicação e os privilégios de acesso ainda precisam de revisão. A comparação prática com Supabase foi interrompida por decisão do autor e não constitui resultado para aquela plataforma.

## Organização da prova

- `src/domain/`: cálculo ilustrativo dos períodos de reposição.
- `src/identity/`: interface e mecanismos usados nas verificações de identidade.
- `functions/neon-authenticated-proof/`: API experimental que valida a identidade.
- `db/neon/`: esquemas e consultas da prova. Alguns scripts são restritos ao branch isolado indicado neles.
- `test/`: verificações locais com dados e dependências simulados quando indicado no próprio teste.

## Executar localmente

Requer Node.js e pnpm compatíveis com as dependências em `pnpm-lock.yaml`. Instale com `pnpm install --frozen-lockfile` e execute `pnpm dev`. O endereço exibido pelo Vite deve ser aberto com `localhost`: a configuração de autenticação de teste pode tratar `127.0.0.1` como outra origem.

Para experimentar a rodada demonstrativa, abra `http://localhost:5173/previa-maquina.html` enquanto o servidor local de desenvolvimento estiver em execução. Se a porta estiver ocupada, use a porta informada pelo Vite. A API de demonstração existe apenas nesse servidor; o build estático não oferece rodadas nem constitui um backend de produção.

Os fluxos conectados também exigem infraestrutura Neon configurada. Copie `.env.example` para `.env.local` e informe os endereços públicos apropriados para cada branch. Variáveis `VITE_` são expostas ao navegador: nunca coloque senhas, tokens, chaves ou strings de conexão nelas. Os scripts SQL devem ser revisados antes de qualquer execução; não são migrações prontas para produção.

As verificações locais existentes podem ser executadas com `node --test test/*.test.mjs`. Elas não substituem testes integrados de contas, rede, autorização e segurança.

## Aprendizagem e participação

O autor definiu a visão do projeto e a regra de ciclos, participou das decisões e operou contas fictícias durante as provas. A IA auxiliou na pesquisa, escrita e revisão de código, preparação de testes e documentação. O trabalho de compreensão, revisão e implementação continua; o funcionamento da prova não deve ser apresentado como domínio independente de todas as tecnologias usadas.
