# Dados da Pokédex em português e inglês

Os 151 nomes e as descrições em inglês usam a [PokéAPI](https://pokeapi.co/docs/v2). Os nomes próprios são preservados em ambos os idiomas; os tipos e as regras do jogo são localizados pela interface.

Na consulta de 26/11/2026, as espécies de Kanto não forneceram descrições `pt`/`pt-br`. O projeto inclui uma tradução para português brasileiro feita uma vez com apoio de IA, a partir das entradas inglesas FireRed/LeafGreen. Ela é uma tradução do projeto, não uma localização oficial. As unidades de medida foram convertidas e arredondadas. Os nomes de golpes citados nas descrições permanecem no idioma original.

`kanto-description-sources.json` registra o texto de origem, a versão do jogo, a URL de cada espécie e a data de coleta. `kanto-descriptions-pt.json` contém as traduções por ID da espécie. Esse conteúdo público faz parte do pacote estático do site e não é gravado por jogador no PostgreSQL. Não há credencial, chamada de IA, serviço pago ou limite mensal de tradução em tempo de execução.

A seleção de descrições prefere entradas nativas da API no idioma solicitado. Na ausência delas, usa o catálogo local para Kanto. Assim, uma eventual entrada nativa em português poderá ser exibida sem descartar a tradução de reserva. Nenhum texto em inglês é apresentado como se fosse português.

Para atualizar o snapshot de origem, execute `node scripts/sync-kanto-descriptions.mjs`. O script consulta cada espécie uma vez, sequencialmente, salva o snapshot e exige que as traduções sejam revistas antes da publicação. O teste de integridade vincula as traduções ao hash do texto inglês; ao mudar o snapshot, revise as traduções e atualize esse hash deliberadamente. O importador não é executado pelo build ou pelo jogo. [Política de uso e cache da PokéAPI](https://pokeapi.co/docs/v2#fairuse).

Não há garantia de revisão linguística humana independente. Correções editoriais devem manter a correspondência com a fonte, sem alterar as regras ou as probabilidades do jogo.
