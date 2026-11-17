# Google Drive

A integração pede `drive.appdata` e usa a pasta privada da app no Drive da conta escolhida. Depois de autorizada, a app junta versões das fichas arquivadas entre aparelhos. O modelo Excel e a ficha em edição ficam no armazenamento local. As cópias manuais continuam disponíveis para transferência entre contas e para a pasta operacional do Drive.

A ligação só inicia após o utilizador escolher **Ligar Google Drive**. A app conserva versões divergentes e atualiza em segundo plano enquanto está aberta. Em Windows e Safari, pode ser necessário autorizar novamente ao abrir a app ou quando expirar a sessão Google.

## Configurar a distribuição

1. Ativa a Drive API e configura o consentimento externo no projeto da Supressão.
2. Regista o cliente Android para `pt.ignispyro.fogosupressao` com o SHA-1 do certificado do APK distribuído. Ativa o valor `android` em `app/drive-config.js` depois de testar a autorização com o APK assinado.
3. Cria um cliente Web no mesmo projeto para a origem HTTPS da app e a origem local do lançador Windows. Define apenas o ID público em `app/drive-config.js`.
4. Autoriza uma conta de teste e confirma a sincronização entre dois aparelhos com fichas fictícias. Publica a configuração OAuth para utilizadores externos antes de disponibilizar os instaladores com a ligação ativa.

A versão para iPhone/iPad usa a app no Safari. A compilação iOS nativa precisa de um cliente iOS próprio e da integração nativa de autorização antes de oferecer esta ligação.
