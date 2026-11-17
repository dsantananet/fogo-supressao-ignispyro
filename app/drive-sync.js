'use strict';

(() => {
  const platform = globalThis.Capacitor?.getPlatform?.();
  const nativeDrive = (native && suppressionDriveConfig.android) ||
    (platform === 'ios' && suppressionDriveConfig.ios);
  const web = (!platform || platform === 'web') &&
    /\.apps\.googleusercontent\.com$/.test(suppressionDriveConfig.webClientId);
  if (!nativeDrive && !web) return;

  const scope = 'https://www.googleapis.com/auth/drive.appdata';
  const endpoint = 'https://www.googleapis.com/drive/v3/';
  const format = 'ignispyro-supressao-drive-v1';
  const name = 'ignispyro-supressao-historico.json';
  const status = message => { $('driveStatus').textContent = message; };
  const authorization = nativeDrive ? androidPlugin('DriveAuthorization', ['authorize']) : null;
  let preferences;
  let browserToken;
  let pending;
  let timeout;

  function browserAuthorization() {
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: suppressionDriveConfig.webClientId, scope,
        callback: result => {
          if (!result.access_token) return reject(new Error('Autorização Google indisponível.'));
          browserToken = {value:result.access_token, until:Date.now() + Number(result.expires_in) * 1000};
          resolve(browserToken.value);
        },
        error_callback: () => reject(new Error('A autorização Google foi interrompida.'))
      });
      client.requestAccessToken({prompt:'select_account'});
    });
  }

  async function request(path, token, options = {}) {
    const response = await fetch(path.startsWith('https://') ? path : endpoint + path, {
      ...options, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(45000),
      headers:{...options.headers, Authorization:'Bearer ' + token}
    });
    if (response.status === 401) browserToken = undefined;
    if (!response.ok) throw new Error('O Google Drive devolveu um erro (' + response.status + ').');
    return response.json();
  }

  async function files(token) {
    const result = [];
    const query = new URLSearchParams({
      spaces:'appDataFolder', q:"name = '" + name + "'", pageSize:'100',
      fields:'nextPageToken,files(id,appProperties,size)'
    });
    do {
      const page = await request('files?' + query, token);
      result.push(...page.files);
      if (!page.nextPageToken) return result;
      query.set('pageToken', page.nextPageToken);
    } while (true);
  }

  async function fingerprint(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  }

  async function upload(token, current, text, hash) {
    const boundary = 'ignispyro-' + key();
    const metadata = {
      name, mimeType:'application/json', appProperties:{device:preferences.device, hash},
      ...(current ? {} : {parents:['appDataFolder']})
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
      text + '\r\n--' + boundary + '--\r\n';
    const path = 'https://www.googleapis.com/upload/drive/v3/files' +
      (current ? '/' + encodeURIComponent(current.id) : '') + '?uploadType=multipart';
    await request(path, token, {method:current ? 'PATCH' : 'POST', body,
      headers:{'Content-Type':'multipart/related; boundary=' + boundary}});
  }

  async function synchronize(interactive) {
    if (!interactive && (!preferences.enabled || !navigator.onLine)) return;
    const token = authorization ? (await authorization.authorize({interactive})).accessToken :
      interactive ? await browserAuthorization() :
        browserToken?.until > Date.now() + 30000 ? browserToken.value : null;
    if (!token) { status('Volta a ligar ao Google para retomar a sincronização.'); return; }
    const {user} = await request('about?fields=user(permissionId)', token);
    if (!user?.permissionId) throw new Error('Não foi possível identificar a conta do Drive.');
    if (preferences.account && preferences.account !== user.permissionId) {
      throw new Error('Seleciona a mesma conta Google que ligaste ao histórico deste aparelho.');
    }
    preferences = {...preferences, enabled:true, account:user.permissionId};
    await storeValue('readwrite', store => store.put(preferences, 'drive'));
    $('driveDisconnect').hidden = false;
    const remoteFiles = await files(token);
    const own = remoteFiles.find(file => file.appProperties?.device === preferences.device);
    const seen = {...preferences.seen};
    for (const file of remoteFiles) {
      if (file.id === own?.id || !file.appProperties?.hash || seen[file.id] === file.appProperties.hash) continue;
      if (Number(file.size) > 25 * 1024 * 1024) throw new Error('Existe uma cópia Drive acima de 25 MB.');
      const cloud = await request('files/' + encodeURIComponent(file.id) + '?alt=media', token);
      if (cloud.format !== format || !Array.isArray(cloud.archive)) {
        throw new Error('Foi encontrada uma cópia em formato desconhecido.');
      }
      // Conflict copies have local IDs. Compare their contents to avoid copying them back and forth.
      const signature = ({id, ...record}) => JSON.stringify(record);
      const unique = new Set(archive.map(record => signature(restoreRecord(record))));
      const incoming = cloud.archive.map(restoreRecord).filter(record => {
        const content = signature(record);
        if (unique.has(content)) return false;
        unique.add(content);
        return true;
      });
      if (incoming.length) await mergeBackup({active:fresh(), archive:incoming});
      seen[file.id] = file.appProperties.hash;
    }
    const text = JSON.stringify({format, archive});
    const hash = await fingerprint(text);
    if (own?.appProperties.hash !== hash && (archive.length || own)) {
      if (new Blob([text]).size > 25 * 1024 * 1024) throw new Error('A cópia Drive excede 25 MB.');
      await upload(token, own, text, hash);
    }
    preferences = {...preferences, seen};
    await storeValue('readwrite', store => store.put(preferences, 'drive'));
    status('Histórico sincronizado ' + new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}) + '.');
  }

  function run(interactive = false) {
    if (pending || !preferences) return;
    $('driveConnect').disabled = true;
    $('driveDisconnect').disabled = true;
    pending = synchronize(interactive).catch(error => status(error.message)).finally(() => {
      pending = undefined;
      $('driveConnect').disabled = false;
      $('driveDisconnect').disabled = false;
    });
  }

  appReady.then(async ready => {
    if (!ready) return;
    $('driveControls').hidden = false;
    preferences = await storeValue('readonly', store => store.get('drive')) ?? {device:key(), seen:{}};
    $('driveDisconnect').hidden = !preferences.enabled;
    $('driveConnect').onclick = () => run(true);
    $('driveDisconnect').onclick = async () => {
      preferences = {...preferences, enabled:false};
      browserToken = undefined;
      await storeValue('readwrite', store => store.put(preferences, 'drive'));
      $('driveDisconnect').hidden = true;
      status('Sincronização pausada neste aparelho.');
    };
    if (web && !globalThis.google?.accounts?.oauth2) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      $('driveConnect').disabled = true;
      script.onload = () => { $('driveConnect').disabled = false; };
      script.onerror = () => status('Google indisponível. Volta a abrir com ligação à Internet.');
      document.head.append(script);
    }
    document.addEventListener('archive-changed', () => {
      if (pending) return;
      clearTimeout(timeout);
      timeout = setTimeout(run, 4000);
    });
    window.addEventListener('online', () => run());
    setInterval(run, 120000);
    run();
  }).catch(() => status('Não foi possível carregar a configuração local do Drive.'));
})();
