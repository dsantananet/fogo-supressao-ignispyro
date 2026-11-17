# Fogo de Supressão — Made by IgnisPyro

Aplicação de registo documental de ocorrências, manobras de fogo de supressão, setores e fotografias.

- Em **Relatório e Excel**, seleciona uma vez o modelo original `Modelo_BD_ Fogo_Supressão.xlsx` ou um livro existente do mesmo formato. O livro fica disponível offline. Podes pré-preencher a ficha a partir de uma linha existente.
- **Exportar Excel no modelo de supressão** cria uma cópia do livro preenchida nas colunas A–S de **Folha1**. Também podes exportar o registo em CSV e imprimir a ficha complementar com fotografias.
- Em **Operações e mapa**, regista séries meteorológicas, equipas, funções, credenciações e meios. Importa ou exporta KML, edita vértices e consulta o esboço offline. São aceites pontos, linhas e polígonos sem anéis interiores. As coordenadas são WGS84 (longitude,latitude).
- O botão **Tirar fotografia** regista a hora no regresso da câmara e tenta obter uma posição GPS. Nas fotografias importadas, preenche a hora e a posição disponíveis na fonte. Cada imagem pode ter uma referência e estar ligada a um setor.
- Em **Histórico**, guarda uma cópia JSON e escolhe o Google Drive no seletor Android quando o fornecedor estiver disponível. Para sincronização manual, recolhe a cópia no outro aparelho e usa **Recolher e juntar registos de uma cópia**. Versões em conflito são preservadas separadamente. A cópia inclui a ficha, o histórico e as fotografias. Seleciona o modelo Excel em cada aparelho.

Utiliza a secção [Releases](https://github.com/dsantananet/fogo-supressao-ignispyro/releases) para instalação no Android.
Consulta [BUILD_ANDROID.md](BUILD_ANDROID.md) para compilar.

## Windows

Abre o executável portátil disponível em Releases e mantém a janela aberta enquanto usas a app no navegador. A aplicação corre neste computador em `http://127.0.0.1:49773/`, incluindo quando estás offline. Usa o mesmo perfil do navegador para reencontrar o histórico. Em **Histórico**, importa uma cópia JSON privada para usar registos já existentes.

Para compilar, executa `windows-src/build.ps1 -OutputDirectory <pasta>` em Windows com Git e .NET Framework 4.8.

Em Android e Windows, a app verifica se existe uma versão mais recente em Releases. A instalação da nova versão é confirmada pelo utilizador. Cada tag de versão compila e testa o APK assinado e o executável Windows antes de publicar ambos.
