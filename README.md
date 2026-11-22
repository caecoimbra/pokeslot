# PokéSlot

Projeto de aprendizagem para construir uma máquina de três rolos inspirada em jogos de Pokémon. O projeto é pessoal, sem finalidade de venda, e está em desenvolvimento.

## Estado atual

O código inclui uma **prova técnica de identidade e saldo** e versões experimentais da máquina e da Pokédex. O jogo completo ainda está em desenvolvimento. As provas usam dados fictícios; o saldo inicial e a reposição definidos para o jogo são aplicados na prévia local e no backend autenticado isolado.

A regra inicial dos três rolos está em desenvolvimento: cada rolo contém 10 Pokébolas, 6 símbolos de giro e 4 vales, com embaralhamento e escolha de posição por rodada. A prévia bilíngue usa um banco SQLite local de teste: saldo e coleção sobrevivem a recarregar e reiniciar o servidor. Todos que acessam a prévia no mesmo computador compartilham o mesmo jogador fictício, sem autenticação; não é um backend seguro para publicação. A prévia usa classificações provisórias e não concede recompensas reais.

Para o jogo, a regra em desenvolvimento prevê saldo inicial de 20 giros e reposição de 10 a cada período completo de 24 horas, acumulada durante a ausência. A prévia local e a prova autenticada isolada aplicam essa regra com o relógio de seus respectivos servidores. A máquina apresenta o próximo horário e permite atualizar o saldo; o horário apresentado não concede giros por si só.

A primeira versão está planejada com as 151 espécies de Kanto e uma interface bilíngue em português e inglês, com alternância pelo jogador. A prévia local sorteia as espécies com chances iguais apenas para testes; a prova Neon usa uma distribuição provisória e persiste as variantes por conta fictícia. Ambas consultam a PokéAPI para mostrar detalhes, e uma falha nessa consulta não apaga a coleção. A solução autenticada ainda é experimental. Quando um texto não estiver disponível no idioma escolhido, sua origem e tratamento precisarão ser definidos. As chances finais e outras regras de recompensa permanecem em definição.

Foram experimentados Neon Auth, PostgreSQL, Neon Data API e uma Neon Function em um branch de teste. A Data API apresentou falha intermitente de contexto de identidade; a causa não foi identificada. A função alternativa passou em cenários pontuais de recuperação de saldo, repetição e concorrência, mas a arquitetura para publicação e os privilégios de acesso ainda precisam de revisão. A comparação prática com Supabase foi interrompida por decisão do autor e não constitui resultado para aquela plataforma.

Uma segunda prova em `proof-identity-safe` integra autenticação, rodada, débito e coleção no PostgreSQL isolado. A função gera a rodada no servidor e registra o resultado junto com o débito; uma operação repetida recupera o mesmo resultado. Ela usa, somente para teste, raridades 70/22/7/1, shiny 0,5%, 2 giros por linha e compensações 1/1/2/3 (dobradas para shiny). A prévia da máquina acessa essa prova em `http://localhost:5173/previa-maquina.html?backend=neon`, com as variáveis públicas de teste configuradas e contas fictícias. Sem o parâmetro, a prévia continua usando o ambiente local. A prova não aplica itens de vale nem está preparada para produção. Não publique o arquivo SQL nem a função como arquitetura definitiva sem revisar privilégios, retenção e recuperação.

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

## Aprendizagem e participação

O autor definiu a visão do projeto e a regra de ciclos, participou das decisões, orientou a diretriz de testes, escrita e revisão do código e operou contas fictícias durante as provas. A IA auxiliou na pesquisa, escrita e revisão de código, preparação de testes e documentação.
